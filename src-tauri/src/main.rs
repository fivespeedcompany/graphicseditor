#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod graph;
mod nodes;
mod state;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::load_image,
            commands::load_node_image,
            commands::execute_graph,
            commands::export_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
