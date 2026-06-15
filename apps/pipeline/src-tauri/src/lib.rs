use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::process::Command;

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
    match Command::new("python3").arg("--version").output() {
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
/// with cwd set to `aligner_dir`. Captures stdout, stderr, and the exit
/// code in one shot — no streaming yet; that's the next slice.
#[tauri::command]
fn run_aligner(
    aligner_dir: String,
    midi_path: String,
    json_path: String,
    out_path: String,
) -> Result<AlignerResult, String> {
    let output = Command::new("python3")
        .arg("-m")
        .arg("aligner")
        .arg(&midi_path)
        .arg(&json_path)
        .arg("-o")
        .arg(&out_path)
        .current_dir(&aligner_dir)
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

/// Load and parse the sidecar review JSON the aligner emits next to
/// the MusicXML output. We don't type-check the shape on the Rust
/// side — TypeScript on the frontend has the authoritative schema and
/// can evolve as the aligner does.
#[tauri::command]
fn load_review(path: String) -> Result<Value, String> {
    let raw = fs::read_to_string(&path).map_err(|e| format!("read {}: {}", path, e))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse {}: {}", path, e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            python_check,
            run_aligner,
            load_review
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
