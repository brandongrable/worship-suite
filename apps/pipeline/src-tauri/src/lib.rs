use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;
use tauri::Emitter;
use tokio::io::AsyncReadExt;

/// Progress payload emitted to the frontend as a Tauri event during
/// a long-running subprocess. `percent` is 0-100, parsed from the
/// stage's tqdm-style stderr output. `line` is the raw line for
/// debugging / display.
#[derive(Clone, Serialize)]
struct StageProgress {
    percent: f64,
    line: String,
}

/// Scan a string for the first occurrence of an integer or decimal
/// percentage (e.g. "  47%|████"). Returns None when no match.
fn parse_tqdm_percent(s: &str) -> Option<f64> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c.is_ascii_digit() {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
                i += 1;
            }
            if i < bytes.len() && bytes[i] == b'%' {
                if let Ok(n) = s[start..i].parse::<f64>() {
                    if (0.0..=100.0).contains(&n) {
                        return Some(n);
                    }
                }
            }
        } else {
            i += 1;
        }
    }
    None
}

/// Drive a subprocess that emits tqdm-style progress on stderr,
/// publishing a `StageProgress` Tauri event under `event_name` for
/// each "\r"-terminated update. Returns (success, exit_code,
/// captured_stdout, captured_stderr) on completion.
///
/// tqdm prints `0%|... 47%|... 100%|...` separated by carriage
/// returns (no newline until the bar finishes). std's BufRead::lines
/// won't see those updates because it splits on \n. We use
/// AsyncReadExt::read_buf and split on \r OR \n manually.
async fn run_with_progress(
    mut command: tokio::process::Command,
    app: &tauri::AppHandle,
    event_name: &'static str,
) -> Result<(bool, Option<i32>, String, String), String> {
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("failed to spawn subprocess: {}", e))?;

    let stdout = child.stdout.take().ok_or("no stdout pipe")?;
    let stderr = child.stderr.take().ok_or("no stderr pipe")?;

    let app_for_stderr = app.clone();
    let stderr_handle = tokio::spawn(async move {
        let mut reader = stderr;
        let mut buf = Vec::with_capacity(4096);
        let mut chunk = [0u8; 1024];
        let mut all = String::new();
        let mut last_percent_emitted: f64 = -1.0;
        loop {
            let n = match reader.read(&mut chunk).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            buf.extend_from_slice(&chunk[..n]);

            // Walk the buffer for \r or \n terminators and emit each
            // completed line. Anything trailing without a terminator
            // stays in `buf` for the next read.
            let mut start = 0;
            for i in 0..buf.len() {
                let c = buf[i];
                if c == b'\r' || c == b'\n' {
                    if i > start {
                        let line = String::from_utf8_lossy(&buf[start..i]).to_string();
                        all.push_str(&line);
                        all.push('\n');
                        if let Some(p) = parse_tqdm_percent(&line) {
                            // Only emit when the percent has moved at
                            // least 1 point — keeps the event volume
                            // sane on long bars.
                            if (p - last_percent_emitted).abs() >= 1.0 {
                                let _ = app_for_stderr.emit(
                                    event_name,
                                    StageProgress { percent: p, line: line.clone() },
                                );
                                last_percent_emitted = p;
                            }
                        }
                    }
                    start = i + 1;
                }
            }
            if start > 0 {
                buf.drain(..start);
            }
        }
        // Flush any trailing un-terminated content.
        if !buf.is_empty() {
            let line = String::from_utf8_lossy(&buf).to_string();
            all.push_str(&line);
        }
        all
    });

    let stdout_handle = tokio::spawn(async move {
        let mut reader = stdout;
        let mut out = String::new();
        let _ = reader.read_to_string(&mut out).await;
        out
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("wait failed: {}", e))?;
    let stdout_text = stdout_handle.await.unwrap_or_default();
    let stderr_text = stderr_handle.await.unwrap_or_default();

    // Final 100% event so the bar always lands at 100 on success.
    if status.success() {
        let _ = app.emit(
            event_name,
            StageProgress { percent: 100.0, line: "complete".to_string() },
        );
    }

    Ok((status.success(), status.code(), stdout_text, stderr_text))
}

/// Path to the Python interpreter Pipeline shells out to. Defaults
/// to `python3` (PATH lookup); the producer can override via
/// `PIPELINE_PYTHON_BIN` in `.env.local` to pin a specific Python
/// — useful when the system `python3` is broken (e.g. Homebrew
/// Python on macOS Tahoe has a libexpat ABI mismatch) and Demucs /
/// the aligner are installed under a pyenv-managed Python instead.
fn python_bin() -> String {
    env::var("PIPELINE_PYTHON_BIN")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "python3".to_string())
}

/// Path to the `whisperx` CLI. Defaults to `whisperx` (PATH lookup).
/// Override with `PIPELINE_WHISPERX_BIN` — typically the same Python
/// bin directory as PIPELINE_PYTHON_BIN.
fn whisperx_bin() -> String {
    env::var("PIPELINE_WHISPERX_BIN")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "whisperx".to_string())
}

#[derive(Serialize)]
struct Health {
    ok: bool,
    rust: String,
}

#[tauri::command]
fn health_check() -> Health {
    Health {
        ok: true,
        rust: "ready".to_string(),
    }
}

#[derive(Serialize)]
struct PythonInfo {
    found: bool,
    version: Option<String>,
    error: Option<String>,
}

/// Probe the host for a usable Python 3. The producer pipeline shells
/// out to `python3 -m aligner ...`, so this is the precondition we
/// want to surface in the UI before the user tries to run anything.
#[tauri::command]
fn python_check() -> PythonInfo {
    match Command::new(&python_bin()).arg("--version").output() {
        Ok(out) if out.status.success() => {
            // Python 3.4+ writes the version to stdout; earlier wrote to
            // stderr. We accept either to be safe.
            let from_stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let version = if from_stdout.is_empty() {
                String::from_utf8_lossy(&out.stderr).trim().to_string()
            } else {
                from_stdout
            };
            PythonInfo {
                found: true,
                version: Some(version),
                error: None,
            }
        }
        Ok(out) => PythonInfo {
            found: false,
            version: None,
            error: Some(format!(
                "python3 exited {} — {}",
                out.status,
                String::from_utf8_lossy(&out.stderr).trim()
            )),
        },
        Err(e) => PythonInfo {
            found: false,
            version: None,
            error: Some(format!("could not spawn python3: {}", e)),
        },
    }
}

#[derive(Serialize)]
struct AlignerResult {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    out_path: String,
}

/// Run the lyric-midi aligner as a Python subprocess.
///
/// Invokes `python3 -m aligner <midi_path> <json_path> -o <out_path>`
/// (plus `-s <structure_path>` when provided) with cwd set to
/// `aligner_dir`. Captures stdout, stderr, and the exit code in one
/// shot — no streaming yet; that's the next slice.
#[tauri::command]
fn run_aligner(
    aligner_dir: String,
    midi_path: String,
    json_path: String,
    out_path: String,
    structure_path: Option<String>,
) -> Result<AlignerResult, String> {
    let mut cmd = Command::new(&python_bin());
    cmd.arg("-m")
        .arg("aligner")
        .arg(&midi_path)
        .arg(&json_path)
        .arg("-o")
        .arg(&out_path)
        .current_dir(&aligner_dir);
    if let Some(s) = structure_path.as_ref().filter(|s| !s.is_empty()) {
        cmd.arg("-s").arg(s);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("failed to spawn python3: {}", e))?;

    Ok(AlignerResult {
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        out_path,
    })
}

#[derive(Serialize)]
struct DemucsResult {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    /// Where Demucs wrote its `<model>/<song>/` stem folder. Empty
    /// when the run failed before producing output.
    output_dir: String,
    /// Absolute paths to the extracted stem files (`vocals.wav`,
    /// `drums.wav`, `bass.wav`, `other.wav`). Empty when none could
    /// be found — caller falls back to reading stderr.
    stems: Vec<String>,
}

/// Compute Demucs's expected output directory for a given input +
/// model: `<output_dir>/<model>/<input_stem>/`. Used by both
/// `demucs_separate` (to walk the result) and `demucs_cache_status`
/// (to detect whether a prior run already produced output we can
/// skip re-computing).
fn demucs_stems_dir(input_audio: &str, output_dir: &str, model: &str) -> PathBuf {
    let stem_basename = PathBuf::from(input_audio)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    PathBuf::from(output_dir).join(model).join(&stem_basename)
}

fn list_demucs_stems(dir: &std::path::Path) -> Vec<String> {
    fs::read_dir(dir)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("wav"))
                .map(|e| e.path().to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Serialize)]
struct CacheStatus {
    cached: bool,
    /// When cached, the absolute path(s) to the existing artifact(s).
    /// For Demucs this is the stems directory + the wav files inside;
    /// for WhisperX it's the JSON file.
    artifact: Option<String>,
    /// Extra detail the UI can surface: stem file paths, the JSON's
    /// modified time, etc. Empty when not cached.
    detail: Vec<String>,
}

/// Cheap pre-flight: does a prior `demucs_separate` run already
/// exist for this (input, output_dir, model) triple? The UI can use
/// the result to short-circuit the Run button and offer "Re-run".
#[tauri::command]
fn demucs_cache_status(
    input_audio: String,
    output_dir: String,
    model: Option<String>,
) -> CacheStatus {
    let model = model.unwrap_or_else(|| "htdemucs".to_string());
    let stems_dir = demucs_stems_dir(&input_audio, &output_dir, &model);
    let stems = list_demucs_stems(&stems_dir);
    // Demucs always produces 4 stems (drums/bass/other/vocals); count
    // those specifically rather than any wav, in case the dir held
    // unrelated audio.
    let has_vocals = stems.iter().any(|p| p.to_lowercase().ends_with("vocals.wav"));
    if has_vocals {
        CacheStatus {
            cached: true,
            artifact: Some(stems_dir.to_string_lossy().to_string()),
            detail: stems,
        }
    } else {
        CacheStatus { cached: false, artifact: None, detail: vec![] }
    }
}

/// Run Demucs source separation as a Python subprocess.
///
/// `mode` controls the stem layout:
///
///   - `"two_stems_vocals"` (default) — passes `--two-stems vocals`,
///     producing exactly `vocals.wav` + `no_vocals.wav`. The latter
///     is the instrumental (everything that isn't the vocal). Fast,
///     simple, and the right call when the producer just wants a
///     vocal/band split.
///   - `"four_stems"` — Demucs's default behavior: produces
///     `vocals.wav`, `drums.wav`, `bass.wav`, `other.wav`. Use when
///     the producer wants to mix the band stems independently.
///
/// `model` is the Demucs model name (`htdemucs` default, plus
/// `htdemucs_ft` / `mdx_extra` / `mdx_extra_q` as common
/// alternatives). Different models can produce different stem sets
/// but the two modes above are stable across all four.
///
/// When the expected output already exists and `force` is false (or
/// unset), this skips the subprocess entirely and returns a
/// synthetic success — the producer can re-run the same input + model
/// across UI sessions without recomputing a 30-second separation.
/// Pass `force: true` to override.
///
/// Demucs writes to `<output_dir>/<model>/<input_stem>/*.wav` —
/// after a successful run, we walk that directory and return the
/// concrete file paths so the UI doesn't need to reproduce the
/// naming convention.
#[tauri::command]
async fn demucs_separate(
    app: tauri::AppHandle,
    input_audio: String,
    output_dir: String,
    model: Option<String>,
    mode: Option<String>,
    force: Option<bool>,
) -> Result<DemucsResult, String> {
    let model = model.unwrap_or_else(|| "htdemucs".to_string());
    let mode = mode.unwrap_or_else(|| "two_stems_vocals".to_string());
    let force = force.unwrap_or(false);
    let stems_dir = demucs_stems_dir(&input_audio, &output_dir, &model);

    // Cache hit short-circuit: if vocals.wav already exists at the
    // expected path and the caller didn't ask for a re-run, return
    // immediately with the existing stems.
    if !force {
        let existing = list_demucs_stems(&stems_dir);
        if existing.iter().any(|p| p.to_lowercase().ends_with("vocals.wav")) {
            return Ok(DemucsResult {
                success: true,
                exit_code: Some(0),
                stdout: format!("cached: {}", stems_dir.to_string_lossy()),
                stderr: String::new(),
                output_dir: stems_dir.to_string_lossy().to_string(),
                stems: existing,
            });
        }
    }

    let mut cmd = tokio::process::Command::new(&python_bin());
    cmd.arg("-m")
        .arg("demucs")
        .arg("-n")
        .arg(&model)
        .arg("-o")
        .arg(&output_dir);
    if mode == "two_stems_vocals" {
        cmd.arg("--two-stems").arg("vocals");
    }
    cmd.arg(&input_audio);

    let (success, exit_code, stdout, stderr) =
        run_with_progress(cmd, &app, "demucs:progress").await?;

    let stems = list_demucs_stems(&stems_dir);

    Ok(DemucsResult {
        success,
        exit_code,
        stdout,
        stderr,
        output_dir: stems_dir.to_string_lossy().to_string(),
        stems,
    })
}

#[derive(Serialize)]
struct WhisperXResult {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    /// Path to the produced `<input_stem>.json` file (the same shape
    /// the aligner already consumes).
    json_path: String,
}

fn whisperx_json_path(input_audio: &str, output_dir: &str) -> PathBuf {
    let basename = PathBuf::from(input_audio)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    PathBuf::from(output_dir).join(format!("{}.json", basename))
}

#[tauri::command]
fn whisperx_cache_status(input_audio: String, output_dir: String) -> CacheStatus {
    let json_path = whisperx_json_path(&input_audio, &output_dir);
    if json_path.exists() {
        CacheStatus {
            cached: true,
            artifact: Some(json_path.to_string_lossy().to_string()),
            detail: vec![],
        }
    } else {
        CacheStatus { cached: false, artifact: None, detail: vec![] }
    }
}

/// Run WhisperX as a subprocess to transcribe an audio file (usually
/// the vocals stem coming out of Demucs) into a `word_segments` JSON
/// — the input shape the aligner expects.
///
/// Defaults to model `base` and language `en`. WhisperX writes
/// `<input_stem>.json` into `output_dir`. Returns the absolute path
/// so the caller can hand it straight to `run_aligner` without
/// reproducing the naming.
///
/// Cached behavior mirrors `demucs_separate`: if the expected JSON
/// already exists at the output path and `force` is false, skip the
/// subprocess and return the existing file. Re-runs cost the full
/// WhisperX latency.
#[tauri::command]
fn whisperx_transcribe(
    input_audio: String,
    output_dir: String,
    model: Option<String>,
    language: Option<String>,
    force: Option<bool>,
) -> Result<WhisperXResult, String> {
    let model = model.unwrap_or_else(|| "base".to_string());
    let lang = language.unwrap_or_else(|| "en".to_string());
    let force = force.unwrap_or(false);

    let json_path = whisperx_json_path(&input_audio, &output_dir);
    if !force && json_path.exists() {
        return Ok(WhisperXResult {
            success: true,
            exit_code: Some(0),
            stdout: format!("cached: {}", json_path.to_string_lossy()),
            stderr: String::new(),
            json_path: json_path.to_string_lossy().to_string(),
        });
    }

    let mut cmd = Command::new(&whisperx_bin());
    cmd.arg(&input_audio)
        .arg("--output_dir")
        .arg(&output_dir)
        .arg("--output_format")
        .arg("json")
        .arg("--model")
        .arg(&model)
        .arg("--language")
        .arg(&lang);
    let output = cmd
        .output()
        .map_err(|e| format!("failed to spawn whisperx: {}", e))?;

    Ok(WhisperXResult {
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        json_path: json_path.to_string_lossy().to_string(),
    })
}

/// Path to the bundled force_align_lyrics.py helper. Mirrors the
/// extract_melody.py layout — lives next to it under apps/pipeline/scripts.
/// Override with PIPELINE_FORCE_ALIGN_SCRIPT for a packaged install.
fn force_align_script() -> PathBuf {
    if let Ok(p) = env::var("PIPELINE_FORCE_ALIGN_SCRIPT") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("scripts")
        .join("force_align_lyrics.py")
}

/// Run WhisperX in forced-alignment mode: skip Whisper transcription
/// entirely and use the Wav2Vec2 align model to distribute a known
/// lyric script across the audio's timeline. Output JSON shape matches
/// `whisperx_transcribe` exactly so the aligner can consume either.
///
/// `script_path` is a plain-text file of the lyrics in singing order
/// (line breaks collapsed to spaces). For worship recordings the
/// producer typically pastes the song's lyric sheet.
#[tauri::command]
fn whisperx_force_align(
    input_audio: String,
    script_path: String,
    output_dir: String,
    language: Option<String>,
    force: Option<bool>,
) -> Result<WhisperXResult, String> {
    let lang = language.unwrap_or_else(|| "en".to_string());
    let force = force.unwrap_or(false);

    let json_path = whisperx_json_path(&input_audio, &output_dir);
    if !force && json_path.exists() {
        return Ok(WhisperXResult {
            success: true,
            exit_code: Some(0),
            stdout: format!("cached: {}", json_path.to_string_lossy()),
            stderr: String::new(),
            json_path: json_path.to_string_lossy().to_string(),
        });
    }

    let script = force_align_script();
    if !script.exists() {
        return Err(format!(
            "force_align_lyrics.py not found at {} — set PIPELINE_FORCE_ALIGN_SCRIPT or check your install",
            script.to_string_lossy()
        ));
    }

    let output = Command::new(&python_bin())
        .arg(&script)
        .arg("--input")
        .arg(&input_audio)
        .arg("--script")
        .arg(&script_path)
        .arg("--output")
        .arg(&json_path)
        .arg("--language")
        .arg(&lang)
        .output()
        .map_err(|e| format!("failed to spawn python: {}", e))?;

    Ok(WhisperXResult {
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        json_path: json_path.to_string_lossy().to_string(),
    })
}

#[derive(Serialize)]
struct StageTool {
    found: bool,
    version: Option<String>,
    error: Option<String>,
}

// ============================================================
// DeepFilterNet — broadband noise suppression
// ============================================================

#[derive(Serialize)]
struct DeepFilterNetResult {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    /// Absolute path to the produced denoised audio file. Empty
    /// when the run failed.
    output_path: String,
}

fn deepfilter_output_path(input_audio: &str, output_dir: &str) -> PathBuf {
    let stem = PathBuf::from(input_audio)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    // deepFilter (the CLI from `deepfilternet` on PyPI) defaults to
    // the DeepFilterNet2 model, which writes
    // `<stem>_DeepFilterNet2.wav`. v3 is opt-in via --model-base-dir.
    PathBuf::from(output_dir).join(format!("{}_DeepFilterNet2.wav", stem))
}

fn deepfilter_legacy_output_paths(input_audio: &str, output_dir: &str) -> Vec<PathBuf> {
    let stem = PathBuf::from(input_audio)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    // Probe all model-version suffixes; the CLI's default is v2 but
    // future model upgrades may bump it.
    vec![
        PathBuf::from(output_dir).join(format!("{}_DeepFilterNet2.wav", stem)),
        PathBuf::from(output_dir).join(format!("{}_DeepFilterNet3.wav", stem)),
        PathBuf::from(output_dir).join(format!("{}_DeepFilterNet.wav", stem)),
    ]
}

#[tauri::command]
fn deepfilternet_cache_status(input_audio: String, output_dir: String) -> CacheStatus {
    for candidate in deepfilter_legacy_output_paths(&input_audio, &output_dir) {
        if candidate.exists() {
            return CacheStatus {
                cached: true,
                artifact: Some(candidate.to_string_lossy().to_string()),
                detail: vec![],
            };
        }
    }
    CacheStatus { cached: false, artifact: None, detail: vec![] }
}

/// Path to the `deepFilter` CLI. Defaults to the bin directory of
/// PIPELINE_PYTHON_BIN if set, otherwise PATH lookup.
fn deepfilter_bin() -> String {
    if let Ok(p) = env::var("PIPELINE_DEEPFILTER_BIN") {
        if !p.is_empty() {
            return p;
        }
    }
    // Try to derive from python_bin (most pip-installed CLIs live
    // next to the python interpreter that installed them).
    let python = python_bin();
    let parent = PathBuf::from(&python).parent().map(PathBuf::from);
    if let Some(p) = parent {
        let candidate = p.join("deepFilter");
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }
    "deepFilter".to_string()
}

/// Run DeepFilterNet to suppress broadband noise (audience, HVAC,
/// room hum) on an audio file — typically the vocals stem coming
/// out of Demucs, before the karaoke separator runs.
///
/// `attenuation_db` controls how aggressively quiet noise is
/// removed (positive number; higher = more aggressive). Default 100
/// matches the CLI default; drop to 40-60 for sustained sung vocals
/// where the speech-trained model can otherwise soften held notes.
#[tauri::command]
fn deepfilternet_run(
    input_audio: String,
    output_dir: String,
    attenuation_db: Option<f64>,
    force: Option<bool>,
) -> Result<DeepFilterNetResult, String> {
    let force = force.unwrap_or(false);
    let expected = deepfilter_output_path(&input_audio, &output_dir);

    if !force {
        for candidate in deepfilter_legacy_output_paths(&input_audio, &output_dir) {
            if candidate.exists() {
                return Ok(DeepFilterNetResult {
                    success: true,
                    exit_code: Some(0),
                    stdout: format!("cached: {}", candidate.to_string_lossy()),
                    stderr: String::new(),
                    output_path: candidate.to_string_lossy().to_string(),
                });
            }
        }
    }

    let mut cmd = Command::new(deepfilter_bin());
    cmd.arg("--output-dir")
        .arg(&output_dir);
    if let Some(db) = attenuation_db {
        cmd.arg("--atten-lim").arg(format!("{}", db));
    }
    cmd.arg(&input_audio);
    let output = cmd
        .output()
        .map_err(|e| format!("failed to spawn deepFilter: {}", e))?;

    Ok(DeepFilterNetResult {
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        output_path: expected.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn deepfilternet_check() -> StageTool {
    let bin = deepfilter_bin();
    match Command::new(&bin).arg("--help").output() {
        Ok(out) if out.status.success() => {
            // CLI doesn't print a clean version banner; surface the
            // resolved binary path so the producer can confirm we're
            // using their installed one.
            StageTool {
                found: true,
                version: Some(bin),
                error: None,
            }
        }
        Ok(out) => StageTool {
            found: false,
            version: None,
            error: Some(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        },
        Err(e) => StageTool {
            found: false,
            version: None,
            error: Some(format!("could not spawn deepFilter ({}): {}", bin, e)),
        },
    }
}

// ============================================================
// audio-separator (UVR CLI) — lead vs background vocal isolation
// ============================================================

#[derive(Serialize)]
struct AudioSeparatorResult {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    /// Absolute paths to the produced stem files. Typically a
    /// "(Vocals)" and "(Instrumental)" pair for vocal models, or a
    /// "(Lead Vocals)" and "(Backing Vocals)" pair for karaoke
    /// models — depends on the model.
    stems: Vec<String>,
}

fn list_audio_separator_outputs(dir: &std::path::Path, input_stem: &str) -> Vec<String> {
    fs::read_dir(dir)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    // audio-separator writes `<stem>_(Vocals)_<model>.wav`
                    // and similar. Match on the input stem prefix.
                    name.starts_with(input_stem)
                        && p.extension().and_then(|x| x.to_str()) == Some("wav")
                })
                .map(|p| p.to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default()
}

fn audio_separator_bin() -> String {
    if let Ok(p) = env::var("PIPELINE_AUDIO_SEPARATOR_BIN") {
        if !p.is_empty() {
            return p;
        }
    }
    let python = python_bin();
    let parent = PathBuf::from(&python).parent().map(PathBuf::from);
    if let Some(p) = parent {
        let candidate = p.join("audio-separator");
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }
    "audio-separator".to_string()
}

#[tauri::command]
fn audio_separator_cache_status(input_audio: String, output_dir: String) -> CacheStatus {
    let input_stem = PathBuf::from(&input_audio)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let outs = list_audio_separator_outputs(&PathBuf::from(&output_dir), &input_stem);
    if outs.is_empty() {
        CacheStatus { cached: false, artifact: None, detail: vec![] }
    } else {
        CacheStatus {
            cached: true,
            artifact: Some(output_dir.clone()),
            detail: outs,
        }
    }
}

/// Run audio-separator (UVR's CLI) for lead-vs-backing vocal
/// isolation. Default model is `MDX23C-De-Reverb-aufr33-jarredou.ckpt`
/// — a karaoke-style separator that's strong on choir bleed and
/// reverb.
///
/// Other useful models the producer might want to try:
///   - "MDX23C-8KFFT-InstVoc_HQ.ckpt"
///   - "UVR-MDX-NET-Karaoke_2.onnx"
///   - "UVR_MDXNET_KARA_2.onnx"
#[tauri::command]
async fn audio_separator_run(
    app: tauri::AppHandle,
    input_audio: String,
    output_dir: String,
    model: Option<String>,
    force: Option<bool>,
) -> Result<AudioSeparatorResult, String> {
    let model = model.unwrap_or_else(|| "UVR_MDXNET_KARA_2.onnx".to_string());
    let force = force.unwrap_or(false);
    let input_stem = PathBuf::from(&input_audio)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    if !force {
        let existing = list_audio_separator_outputs(&PathBuf::from(&output_dir), &input_stem);
        if !existing.is_empty() {
            return Ok(AudioSeparatorResult {
                success: true,
                exit_code: Some(0),
                stdout: format!("cached: {} stem(s) in {}", existing.len(), output_dir),
                stderr: String::new(),
                stems: existing,
            });
        }
    }

    let mut cmd = tokio::process::Command::new(audio_separator_bin());
    cmd.arg(&input_audio)
        .arg("--output_dir")
        .arg(&output_dir)
        .arg("--model_filename")
        .arg(&model);

    let (success, exit_code, stdout, stderr) =
        run_with_progress(cmd, &app, "audio-separator:progress").await?;

    let stems = list_audio_separator_outputs(&PathBuf::from(&output_dir), &input_stem);

    Ok(AudioSeparatorResult {
        success,
        exit_code,
        stdout,
        stderr,
        stems,
    })
}

#[tauri::command]
fn audio_separator_check() -> StageTool {
    let bin = audio_separator_bin();
    match Command::new(&bin).arg("--env_info").output() {
        Ok(out) if out.status.success() => {
            let first_line = String::from_utf8_lossy(&out.stdout)
                .lines()
                .find(|l| !l.trim().is_empty())
                .unwrap_or("")
                .trim()
                .to_string();
            StageTool {
                found: true,
                version: if first_line.is_empty() {
                    Some(bin)
                } else {
                    Some(first_line)
                },
                error: None,
            }
        }
        Ok(_) => {
            // --env_info isn't in older versions; fall back to --help.
            match Command::new(&bin).arg("--help").output() {
                Ok(out) if out.status.success() => StageTool {
                    found: true,
                    version: Some(bin),
                    error: None,
                },
                Ok(out) => StageTool {
                    found: false,
                    version: None,
                    error: Some(String::from_utf8_lossy(&out.stderr).trim().to_string()),
                },
                Err(e) => StageTool {
                    found: false,
                    version: None,
                    error: Some(format!("could not spawn audio-separator ({}): {}", bin, e)),
                },
            }
        }
        Err(e) => StageTool {
            found: false,
            version: None,
            error: Some(format!("could not spawn audio-separator ({}): {}", bin, e)),
        },
    }
}

// ============================================================
// extract-melody — CREPE monophonic pitch tracker → MIDI
// ============================================================

#[derive(Serialize)]
struct ExtractMelodyResult {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    midi_path: String,
}

/// Path to the bundled extract_melody.py helper. In dev this lives
/// at `apps/pipeline/scripts/extract_melody.py` — one level up from
/// the src-tauri Cargo crate. Producer can override with
/// PIPELINE_MELODY_SCRIPT for a packaged install.
fn extract_melody_script() -> PathBuf {
    if let Ok(p) = env::var("PIPELINE_MELODY_SCRIPT") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("scripts")
        .join("extract_melody.py")
}

#[tauri::command]
fn extract_melody_cache_status(midi_path: String) -> CacheStatus {
    if PathBuf::from(&midi_path).exists() {
        CacheStatus {
            cached: true,
            artifact: Some(midi_path),
            detail: vec![],
        }
    } else {
        CacheStatus { cached: false, artifact: None, detail: vec![] }
    }
}

/// Run the extract_melody.py helper to convert a vocal audio file
/// into a monophonic melody MIDI via CREPE pitch tracking. The
/// resulting .mid feeds directly into the aligner's MIDI picker.
///
/// `confidence` (0..1, default 0.5) — CREPE confidence threshold;
/// frames below are treated as silence. Lower captures more notes
/// at the cost of more spurious ones.
///
/// `min_duration_sec` (default 0.05) — minimum note length kept.
/// Filters out per-frame jitter that survived hysteresis.
///
/// `model` ("full" default, or "tiny") — CREPE network size. Full
/// is the right call for accuracy; tiny is ~10× faster on CPU when
/// you're iterating.
#[tauri::command]
async fn extract_melody_run(
    app: tauri::AppHandle,
    input_audio: String,
    midi_path: String,
    confidence: Option<f64>,
    min_duration_sec: Option<f64>,
    model: Option<String>,
    force: Option<bool>,
) -> Result<ExtractMelodyResult, String> {
    let force = force.unwrap_or(false);

    if !force && PathBuf::from(&midi_path).exists() {
        return Ok(ExtractMelodyResult {
            success: true,
            exit_code: Some(0),
            stdout: format!("cached: {}", midi_path),
            stderr: String::new(),
            midi_path,
        });
    }

    let script = extract_melody_script();
    if !script.exists() {
        return Err(format!(
            "extract_melody.py not found at {} — set PIPELINE_MELODY_SCRIPT or check your install",
            script.to_string_lossy()
        ));
    }

    let mut cmd = tokio::process::Command::new(&python_bin());
    cmd.arg(&script)
        .arg("--input")
        .arg(&input_audio)
        .arg("--output")
        .arg(&midi_path)
        .arg("--model")
        .arg(model.unwrap_or_else(|| "full".to_string()))
        .arg("--confidence")
        .arg(format!("{}", confidence.unwrap_or(0.5)))
        .arg("--min-duration")
        .arg(format!("{}", min_duration_sec.unwrap_or(0.05)));

    let (success, exit_code, stdout, stderr) =
        run_with_progress(cmd, &app, "extract-melody:progress").await?;

    Ok(ExtractMelodyResult {
        success,
        exit_code,
        stdout,
        stderr,
        midi_path,
    })
}

#[tauri::command]
fn extract_melody_check() -> StageTool {
    // Probe the helper script's dependency chain by running it with
    // --help. That hits the late imports at the top of main() and
    // surfaces a clean missing-dep message if torchcrepe/mido aren't
    // installed.
    let script = extract_melody_script();
    if !script.exists() {
        return StageTool {
            found: false,
            version: None,
            error: Some(format!(
                "extract_melody.py not at expected path: {}",
                script.to_string_lossy()
            )),
        };
    }
    let out = Command::new(&python_bin())
        .arg(&script)
        .arg("--help")
        .output();
    match out {
        Ok(o) if o.status.success() => {
            // Cross-check torchcrepe importability separately so the
            // "found: yes" message doesn't lie when the script's
            // help text works but torchcrepe isn't installed.
            // torchcrepe doesn't expose __version__, mido does on
            // some versions but not all — just confirm import works.
            let probe = Command::new(&python_bin())
                .args([
                    "-c",
                    "import torchcrepe, mido; print('torchcrepe + mido ok')",
                ])
                .output();
            match probe {
                Ok(p) if p.status.success() => StageTool {
                    found: true,
                    version: Some(
                        String::from_utf8_lossy(&p.stdout)
                            .trim()
                            .to_string(),
                    ),
                    error: None,
                },
                Ok(p) => StageTool {
                    found: false,
                    version: None,
                    error: Some(format!(
                        "torchcrepe / mido import failed:\n{}",
                        String::from_utf8_lossy(&p.stderr).trim()
                    )),
                },
                Err(e) => StageTool {
                    found: false,
                    version: None,
                    error: Some(format!("could not probe torchcrepe: {}", e)),
                },
            }
        }
        Ok(o) => StageTool {
            found: false,
            version: None,
            error: Some(String::from_utf8_lossy(&o.stderr).trim().to_string()),
        },
        Err(e) => StageTool {
            found: false,
            version: None,
            error: Some(format!("could not run python3 {}: {}",
                                script.to_string_lossy(), e)),
        },
    }
}

/// Sanity-check that Demucs is installed and importable. Surfaces in
/// the Pipeline UI so the producer knows whether to `pip install
/// demucs` before kicking off a separation run.
#[tauri::command]
fn demucs_check() -> StageTool {
    match Command::new(&python_bin())
        .args(["-c", "import demucs; print(demucs.__version__)"])
        .output()
    {
        Ok(out) if out.status.success() => StageTool {
            found: true,
            version: Some(String::from_utf8_lossy(&out.stdout).trim().to_string()),
            error: None,
        },
        Ok(out) => StageTool {
            found: false,
            version: None,
            error: Some(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        },
        Err(e) => StageTool {
            found: false,
            version: None,
            error: Some(format!("could not run python3: {}", e)),
        },
    }
}

/// Sanity-check that WhisperX is on PATH. Uses `whisperx --help` and
/// grabs the first line of stdout as a coarse version proxy (WhisperX
/// doesn't print a clean `--version` today).
#[tauri::command]
fn whisperx_check() -> StageTool {
    match Command::new(&whisperx_bin()).arg("--help").output() {
        Ok(out) if out.status.success() => {
            let first_line = String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            StageTool {
                found: true,
                version: if first_line.is_empty() {
                    Some("installed".to_string())
                } else {
                    Some(first_line)
                },
                error: None,
            }
        }
        Ok(out) => StageTool {
            found: false,
            version: None,
            error: Some(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        },
        Err(e) => StageTool {
            found: false,
            version: None,
            error: Some(format!("could not spawn whisperx: {}", e)),
        },
    }
}

/// Load and parse the sidecar review JSON the aligner emits next to
/// the MusicXML output. We don't type-check the shape on the Rust
/// side — TypeScript on the frontend has the authoritative schema and
/// can evolve as the aligner does.
#[tauri::command]
fn load_review(path: String) -> Result<Value, String> {
    let raw = fs::read_to_string(&path).map_err(|e| format!("read {}: {}", path, e))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse {}: {}", path, e))
}

#[derive(Serialize)]
struct PublishConfig {
    has_url: bool,
    has_service_key: bool,
    has_producer_id: bool,
    url_host: Option<String>,
}

/// Report which of the publish env vars Pipeline can see. UI surfaces
/// this so the producer knows which keys still need to land in
/// .env.local before "Publish" will work.
#[tauri::command]
fn publish_config() -> PublishConfig {
    let url = env::var("SUPABASE_URL").ok();
    PublishConfig {
        has_url: url.as_ref().is_some_and(|s| !s.is_empty()),
        has_service_key: env::var("SUPABASE_SERVICE_ROLE_KEY")
            .ok()
            .is_some_and(|s| !s.is_empty()),
        has_producer_id: env::var("WORSHIP_PRODUCER_USER_ID")
            .ok()
            .is_some_and(|s| !s.is_empty()),
        url_host: url.and_then(|u| {
            u.split("://").nth(1).map(|rest| {
                rest.split('/').next().unwrap_or(rest).to_string()
            })
        }),
    }
}

#[derive(Deserialize)]
struct PublishInput {
    title: String,
    key: String,
    bpm: f64,
    lead_gender: String,
    /// Optional. The full sidecar review JSON (or any other producer
    /// payload). Written to songs.record JSONB. Pass null to skip.
    record: Option<Value>,
}

#[derive(Serialize)]
struct PublishResult {
    id: String,
    owner_id: String,
    title: String,
}

/// Map a raw section name from the aligner's sidecar (lowercase
/// human label like "verse 1", "chorus", "verse 2 (repeat)") to one
/// of the core's SectionType enum values. Unknown names fall back
/// to INSTRUMENTAL — sections we can't classify are most likely
/// non-vocal interludes, and INSTRUMENTAL renders neutrally in
/// the mixer's section bar.
fn map_section_type(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    let normalized = lower
        .replace('-', " ")
        .replace('_', " ");
    // Strip a trailing instance number ("verse 1" -> "verse") and any
    // parenthetical annotation ("verse 1 (repeat)" -> "verse").
    let cleaned: String = normalized
        .split('(')
        .next()
        .unwrap_or(&normalized)
        .chars()
        .filter(|c| !c.is_ascii_digit())
        .collect::<String>()
        .trim()
        .to_string();
    // Order matters: check the multi-word forms first so "pre chorus"
    // doesn't get classified as just "chorus".
    if cleaned.starts_with("pre chorus") || cleaned.starts_with("prechorus") {
        return "PRE_CHORUS";
    }
    if cleaned.starts_with("post chorus") || cleaned.starts_with("postchorus") {
        return "POST_CHORUS";
    }
    match cleaned.as_str() {
        s if s.starts_with("intro") => "INTRO",
        s if s.starts_with("verse") => "VERSE",
        s if s.starts_with("chorus") => "CHORUS",
        s if s.starts_with("bridge") => "BRIDGE",
        s if s.starts_with("refrain") => "REFRAIN",
        s if s.starts_with("tag") => "TAG",
        s if s.starts_with("outro") => "OUTRO",
        s if s.starts_with("ending") => "ENDING",
        s if s.starts_with("instrumental") => "INSTRUMENTAL",
        s if s.starts_with("interlude") => "INTERLUDE",
        s if s.starts_with("vamp") => "VAMP",
        s if s.starts_with("turnaround") => "TURNAROUND",
        _ => "INSTRUMENTAL",
    }
}

/// In-place transformation of `record.sections` from the aligner's
/// raw timing format to the core `Section[]` shape Vocal Booth's
/// mixer consumes via its adapter.
///
/// Raw entry:
///   { name, repeat_index, start_sec, end_sec, words, instrumental }
///
/// Core Section entry:
///   { id, type, instanceNumber, startTime, endTime, partStatus }
///
/// `instanceNumber` is a per-SectionType counter across the whole
/// performance (so "verse 1" + "verse 1 (repeat)" become VERSE/1 +
/// VERSE/2 in the canonicalized form). `partStatus` is left empty
/// — harmony arrangement is Vocal Booth's authoring concern, not
/// the producer's; an owner can fill it in via the SectionsPanel.
fn normalize_sections_in_record(record: &mut Value) {
    let Some(raw) = record.get("sections").and_then(|v| v.as_array()) else {
        return;
    };
    if raw.is_empty() {
        return;
    }

    use std::collections::HashMap;
    let mut instance_counter: HashMap<&'static str, i64> = HashMap::new();
    let mut canonical: Vec<Value> = Vec::with_capacity(raw.len());

    for entry in raw.iter() {
        let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let start = entry.get("start_sec").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let end = entry.get("end_sec").and_then(|v| v.as_f64()).unwrap_or(start);
        let section_type = map_section_type(name);
        let count = instance_counter.entry(section_type).or_insert(0);
        *count += 1;
        let instance_number = *count;
        canonical.push(json!({
            "id": format!("{}_{}", section_type.to_lowercase(), instance_number),
            "type": section_type,
            "instanceNumber": instance_number,
            "startTime": start,
            "endTime": end,
            "partStatus": {
                "soprano": "inactive",
                "alto": "inactive",
                "tenor": "inactive",
                "baritone": "inactive",
            },
        }));
    }

    // Preserve the raw producer-side timings on a sibling key so
    // they're available for debugging / re-derivation without
    // re-running the aligner. The mixer adapter only reads
    // `sections`, so this is a no-op consumer-side.
    let canonical_ids: Vec<String> = canonical
        .iter()
        .map(|s| {
            s.get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        })
        .collect();
    if let Some(obj) = record.as_object_mut() {
        if let Some(raw_value) = obj.remove("sections") {
            obj.insert("section_timings_raw".to_string(), raw_value);
        }
        obj.insert("sections".to_string(), Value::Array(canonical));
    }

    normalize_parts_in_record(record, &canonical_ids);
}

/// Walks `record.parts[i].notes[j]`, replacing the aligner's
/// `section_index` (0-based int into the literal section order)
/// with `sectionId` (the canonical id assigned by
/// `normalize_sections_in_record` in the matching position).
///
/// Should be called AFTER sections are canonicalized so the two
/// arrays line up. A `section_index` of null or out-of-range is
/// preserved as `sectionId: ""` — the consumer-side PartLayer type
/// requires sectionId, but an empty string is cheaper than failing
/// the whole publish over a single pickup note.
fn normalize_parts_in_record(record: &mut Value, section_ids: &[String]) {
    let Some(parts) = record.get_mut("parts").and_then(|v| v.as_array_mut()) else {
        return;
    };
    for layer in parts.iter_mut() {
        let Some(notes) = layer.get_mut("notes").and_then(|v| v.as_array_mut()) else {
            continue;
        };
        for note in notes.iter_mut() {
            let Some(obj) = note.as_object_mut() else { continue };
            let idx = obj
                .get("section_index")
                .and_then(|v| v.as_i64())
                .and_then(|i| {
                    if i >= 0 && (i as usize) < section_ids.len() {
                        Some(i as usize)
                    } else {
                        None
                    }
                });
            let section_id = idx
                .and_then(|i| section_ids.get(i).cloned())
                .unwrap_or_default();
            obj.remove("section_index");
            obj.insert("sectionId".to_string(), Value::String(section_id));
        }
    }
}

/// Insert a minimal song row into the Supabase `songs` table via
/// PostgREST. Uses the service role key (RLS-bypassing) so this works
/// without an end-user session — appropriate for a producer/admin
/// tool that owns canonical writes.
///
/// owner_id is read from WORSHIP_PRODUCER_USER_ID; that uuid must
/// belong to an existing auth.users row (FK constraint).
#[tauri::command]
fn publish_song(input: PublishInput) -> Result<PublishResult, String> {
    let url = env::var("SUPABASE_URL").map_err(|_| "SUPABASE_URL not set".to_string())?;
    let key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY not set".to_string())?;
    let owner = env::var("WORSHIP_PRODUCER_USER_ID")
        .map_err(|_| "WORSHIP_PRODUCER_USER_ID not set".to_string())?;

    let endpoint = format!("{}/rest/v1/songs", url.trim_end_matches('/'));

    let mut body = json!({
        "owner_id": owner,
        "title": input.title,
        "key": input.key,
        "bpm": input.bpm,
        "lead_gender": input.lead_gender,
        "visibility": "private",
    });
    if let Some(mut record) = input.record {
        // Transform the aligner's raw section timings (if present) into
        // the core Section[] shape Vocal Booth's mixer adapter expects.
        // No-op when the producer didn't run with a structure map.
        normalize_sections_in_record(&mut record);
        body["record"] = record;
    }

    let resp = ureq::post(&endpoint)
        .set("apikey", &key)
        .set("Authorization", &format!("Bearer {}", key))
        .set("Content-Type", "application/json")
        .set("Prefer", "return=representation")
        .send_json(body)
        .map_err(|e| match e {
            ureq::Error::Status(code, response) => {
                let body = response.into_string().unwrap_or_default();
                format!("supabase returned {} — {}", code, body)
            }
            ureq::Error::Transport(t) => format!("transport: {}", t),
        })?;

    let inserted: Vec<Value> = resp
        .into_json()
        .map_err(|e| format!("could not parse insert response: {}", e))?;

    let row = inserted
        .into_iter()
        .next()
        .ok_or_else(|| "supabase returned empty insert array".to_string())?;

    Ok(PublishResult {
        id: row
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        owner_id: row
            .get("owner_id")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        title: row
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}

#[derive(Deserialize)]
struct UploadStemInput {
    song_id: String,
    track: String,
    file_path: String,
}

#[derive(Serialize)]
struct UploadStemResult {
    storage_key: String,
    bytes: u64,
    content_type: String,
}

fn audio_content_type(ext: &str) -> &'static str {
    match ext {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" | "aac" => "audio/mp4",
        _ => "application/octet-stream",
    }
}

/// Upload an audio file to the `stems` storage bucket at
/// `stems/<song_id>/<track>.<ext>`. Uses upsert so re-uploading the
/// same track replaces it.
#[tauri::command]
fn upload_stem(input: UploadStemInput) -> Result<UploadStemResult, String> {
    let url = env::var("SUPABASE_URL").map_err(|_| "SUPABASE_URL not set".to_string())?;
    let key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY not set".to_string())?;

    let path = std::path::Path::new(&input.file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_lowercase();
    let content_type = audio_content_type(&ext);

    let bytes = fs::read(&input.file_path)
        .map_err(|e| format!("read {}: {}", input.file_path, e))?;
    let byte_count = bytes.len() as u64;

    let key_in_bucket = format!("{}/{}.{}", input.song_id, input.track, ext);
    let endpoint = format!(
        "{}/storage/v1/object/stems/{}",
        url.trim_end_matches('/'),
        key_in_bucket
    );

    let resp = ureq::post(&endpoint)
        .set("apikey", &key)
        .set("Authorization", &format!("Bearer {}", key))
        .set("Content-Type", content_type)
        .set("x-upsert", "true")
        .send_bytes(&bytes)
        .map_err(|e| match e {
            ureq::Error::Status(code, response) => {
                let body = response.into_string().unwrap_or_default();
                format!("upload returned {} — {}", code, body)
            }
            ureq::Error::Transport(t) => format!("transport: {}", t),
        })?;

    // Storage returns JSON {Key, Id, ...} but we don't need to parse it.
    let _ = resp.into_string();

    Ok(UploadStemResult {
        storage_key: format!("stems/{}", key_in_bucket),
        bytes: byte_count,
        content_type: content_type.to_string(),
    })
}

#[derive(Deserialize)]
struct PatchStemsInput {
    song_id: String,
    track: String,
    storage_key: String,
}

/// After a successful stem upload, record the storage key on the song
/// row by augmenting `songs.record.stems` with the new track.
///
/// PostgREST doesn't have a great in-place JSONB patch primitive, so
/// we read the current record, merge in memory, and write back.
#[tauri::command]
fn patch_song_stems(input: PatchStemsInput) -> Result<Value, String> {
    let url = env::var("SUPABASE_URL").map_err(|_| "SUPABASE_URL not set".to_string())?;
    let key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY not set".to_string())?;
    let base = url.trim_end_matches('/');

    // 1. Read current record.
    let select_endpoint = format!(
        "{}/rest/v1/songs?id=eq.{}&select=record",
        base, input.song_id
    );
    let resp = ureq::get(&select_endpoint)
        .set("apikey", &key)
        .set("Authorization", &format!("Bearer {}", key))
        .call()
        .map_err(|e| format!("fetch record: {}", e))?;
    let rows: Vec<Value> = resp.into_json().map_err(|e| format!("parse rows: {}", e))?;
    let row = rows
        .into_iter()
        .next()
        .ok_or_else(|| format!("song {} not found", input.song_id))?;
    let mut record = row
        .get("record")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if !record.is_object() {
        record = json!({});
    }

    // 2. Merge in the new stem entry.
    {
        let record_obj = record.as_object_mut().expect("record is object");
        let stems = record_obj
            .entry("stems".to_string())
            .or_insert_with(|| json!({}));
        if !stems.is_object() {
            *stems = json!({});
        }
        stems
            .as_object_mut()
            .expect("stems is object")
            .insert(input.track.clone(), Value::String(input.storage_key.clone()));
    }

    // 3. Write back.
    let patch_endpoint = format!("{}/rest/v1/songs?id=eq.{}", base, input.song_id);
    let resp = ureq::patch(&patch_endpoint)
        .set("apikey", &key)
        .set("Authorization", &format!("Bearer {}", key))
        .set("Content-Type", "application/json")
        .set("Prefer", "return=representation")
        .send_json(json!({ "record": record }))
        .map_err(|e| match e {
            ureq::Error::Status(code, response) => {
                let body = response.into_string().unwrap_or_default();
                format!("patch returned {} — {}", code, body)
            }
            ureq::Error::Transport(t) => format!("transport: {}", t),
        })?;
    let updated: Value = resp.into_json().map_err(|e| format!("parse patch: {}", e))?;
    Ok(updated)
}

/// Walk up from the binary to find the workspace-root .env.local and
/// load its KEY=VALUE pairs into the process env. Best-effort: any
/// failure (file missing, parse error) is silent — publish_config
/// will surface which keys ended up unset.
fn load_workspace_env() {
    // In `tauri dev`, current_exe() is .../apps/pipeline/src-tauri/target/debug/pipeline.
    // The workspace root is 4 levels up.
    if let Ok(exe) = env::current_exe() {
        let mut dir: PathBuf = exe.clone();
        for _ in 0..6 {
            if !dir.pop() {
                break;
            }
            let candidate = dir.join(".env.local");
            if candidate.exists() {
                let _ = dotenvy::from_path(&candidate);
                break;
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_workspace_env();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            python_check,
            run_aligner,
            demucs_separate,
            demucs_cache_status,
            whisperx_transcribe,
            whisperx_force_align,
            whisperx_cache_status,
            demucs_check,
            whisperx_check,
            deepfilternet_run,
            deepfilternet_cache_status,
            deepfilternet_check,
            audio_separator_run,
            audio_separator_cache_status,
            audio_separator_check,
            extract_melody_run,
            extract_melody_cache_status,
            extract_melody_check,
            load_review,
            publish_config,
            publish_song,
            upload_stem,
            patch_song_stems
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_common_section_names() {
        assert_eq!(map_section_type("intro"), "INTRO");
        assert_eq!(map_section_type("Intro"), "INTRO");
        assert_eq!(map_section_type("verse 1"), "VERSE");
        assert_eq!(map_section_type("verse 2 (repeat)"), "VERSE");
        assert_eq!(map_section_type("chorus"), "CHORUS");
        assert_eq!(map_section_type("pre-chorus"), "PRE_CHORUS");
        assert_eq!(map_section_type("PRE CHORUS"), "PRE_CHORUS");
        assert_eq!(map_section_type("post chorus"), "POST_CHORUS");
        assert_eq!(map_section_type("post-chorus"), "POST_CHORUS");
        assert_eq!(map_section_type("bridge"), "BRIDGE");
        assert_eq!(map_section_type("tag"), "TAG");
        assert_eq!(map_section_type("outro"), "OUTRO");
        assert_eq!(map_section_type("instrumental"), "INSTRUMENTAL");
        assert_eq!(map_section_type("turnaround"), "TURNAROUND");
        // Unknown labels fall back to INSTRUMENTAL.
        assert_eq!(map_section_type("breakdown"), "INSTRUMENTAL");
        assert_eq!(map_section_type(""), "INSTRUMENTAL");
    }

    #[test]
    fn normalize_skips_when_no_sections_field() {
        let mut record = json!({ "summary": { "tempo_bpm": 128 } });
        let before = record.clone();
        normalize_sections_in_record(&mut record);
        assert_eq!(record, before);
    }

    #[test]
    fn normalize_skips_when_sections_empty() {
        let mut record = json!({ "sections": [] });
        let before = record.clone();
        normalize_sections_in_record(&mut record);
        assert_eq!(record, before);
    }

    #[test]
    fn normalize_transforms_raw_timings_to_core_sections() {
        let mut record = json!({
            "sections": [
                { "name": "intro", "repeat_index": 1, "start_sec": 0.0, "end_sec": 18.0, "words": 0, "instrumental": true },
                { "name": "verse 1", "repeat_index": 1, "start_sec": 18.0, "end_sec": 33.0, "words": 24, "instrumental": false },
                { "name": "chorus", "repeat_index": 1, "start_sec": 48.0, "end_sec": 63.0, "words": 25, "instrumental": false },
                { "name": "chorus", "repeat_index": 2, "start_sec": 101.0, "end_sec": 116.0, "words": 25, "instrumental": false },
                { "name": "verse 1 (repeat)", "repeat_index": 1, "start_sec": 33.0, "end_sec": 48.0, "words": 24, "instrumental": false },
            ]
        });

        normalize_sections_in_record(&mut record);

        // Raw input is preserved on a sibling key for debugging.
        let raw = record.get("section_timings_raw").unwrap();
        assert_eq!(raw.as_array().unwrap().len(), 5);

        // `sections` is now the core Section[] shape, in the same
        // order as the raw input (chronology decisions live consumer-
        // side; the adapter sorts by startTime).
        let canonical = record.get("sections").unwrap().as_array().unwrap();
        assert_eq!(canonical.len(), 5);

        // INTRO/1, VERSE/1, CHORUS/1, CHORUS/2, VERSE/2 — the second
        // verse instance is "verse 1 (repeat)" mapped to VERSE/2 via
        // the per-type instance counter.
        assert_eq!(canonical[0]["type"], "INTRO");
        assert_eq!(canonical[0]["instanceNumber"], 1);
        assert_eq!(canonical[1]["type"], "VERSE");
        assert_eq!(canonical[1]["instanceNumber"], 1);
        assert_eq!(canonical[2]["type"], "CHORUS");
        assert_eq!(canonical[2]["instanceNumber"], 1);
        assert_eq!(canonical[3]["type"], "CHORUS");
        assert_eq!(canonical[3]["instanceNumber"], 2);
        assert_eq!(canonical[4]["type"], "VERSE");
        assert_eq!(canonical[4]["instanceNumber"], 2);

        // partStatus defaults to all-inactive so the section bar
        // renders cleanly until an owner authors harmony.
        let part_status = canonical[2].get("partStatus").unwrap();
        assert_eq!(part_status["soprano"], "inactive");
        assert_eq!(part_status["alto"], "inactive");
        assert_eq!(part_status["tenor"], "inactive");
        assert_eq!(part_status["baritone"], "inactive");

        // startTime / endTime carry over as f64 from the raw timings.
        assert_eq!(canonical[1]["startTime"], 18.0);
        assert_eq!(canonical[1]["endTime"], 33.0);
    }

    #[test]
    fn normalize_transforms_parts_section_index_to_section_id() {
        let mut record = json!({
            "sections": [
                { "name": "intro", "repeat_index": 1, "start_sec": 0.0, "end_sec": 18.0, "words": 0, "instrumental": true },
                { "name": "verse 1", "repeat_index": 1, "start_sec": 18.0, "end_sec": 33.0, "words": 24, "instrumental": false },
            ],
            "parts": [
                {
                    "part": "unison",
                    "notes": [
                        { "col": 0, "section_index": 0, "onset": 0.0, "duration": 1.0, "pitch": 60, "syllable": null, "confidence": null },
                        { "col": 1, "section_index": 1, "onset": 18.5, "duration": 0.5, "pitch": 62, "syllable": "I've", "confidence": 0.5 },
                        { "col": 2, "section_index": null, "onset": 0.0, "duration": 0.5, "pitch": 60, "syllable": null, "confidence": null },
                    ]
                }
            ]
        });

        normalize_sections_in_record(&mut record);

        // section_index is gone; sectionId carries the canonical id.
        let notes = &record["parts"][0]["notes"];
        assert_eq!(notes[0]["sectionId"], "intro_1");
        assert!(notes[0].get("section_index").is_none());
        assert_eq!(notes[1]["sectionId"], "verse_1");
        // Out-of-range / null section_index becomes empty string.
        assert_eq!(notes[2]["sectionId"], "");

        // Other PartNote fields pass through unchanged.
        assert_eq!(notes[1]["pitch"], 62);
        assert_eq!(notes[1]["syllable"], "I've");
        assert_eq!(notes[1]["confidence"], 0.5);
    }

    #[test]
    fn normalize_handles_missing_parts_field() {
        let mut record = json!({
            "sections": [
                { "name": "verse 1", "repeat_index": 1, "start_sec": 0.0, "end_sec": 10.0, "words": 5, "instrumental": false }
            ]
        });
        // Should not panic — parts is just absent.
        normalize_sections_in_record(&mut record);
        assert!(record.get("parts").is_none());
    }

    #[test]
    fn normalize_preserves_unrelated_record_keys() {
        let mut record = json!({
            "summary": { "tempo_bpm": 128 },
            "items": [{ "kind": "low_confidence" }],
            "stems": { "lead": "stems/abc/lead.mp3" },
            "sections": [
                { "name": "verse 1", "repeat_index": 1, "start_sec": 0.0, "end_sec": 10.0, "words": 5, "instrumental": false },
            ],
        });

        normalize_sections_in_record(&mut record);

        assert_eq!(record["summary"]["tempo_bpm"], 128);
        assert_eq!(record["items"].as_array().unwrap().len(), 1);
        assert_eq!(record["stems"]["lead"], "stems/abc/lead.mp3");
    }
}
