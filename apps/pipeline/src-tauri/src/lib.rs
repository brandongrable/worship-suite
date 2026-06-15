use serde::Serialize;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![health_check, python_check])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
