use serde::Serialize;

#[derive(Serialize)]
struct Health {
    ok: bool,
    rust: String,
}

#[tauri::command]
fn health_check() -> Health {
    Health {
        ok: true,
        rust: format!("{}", rustc_version_runtime()),
    }
}

fn rustc_version_runtime() -> String {
    // Tauri itself reports the version via env at build time; expose a
    // simple known string for now. We'll surface real subprocess
    // health (Python aligner reachable, etc.) as we wire each stage.
    "ready".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![health_check])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
