use base64::{engine::general_purpose, Engine};
use std::io::Cursor;
use std::sync::Arc;
use tauri::State;

use crate::graph::cache::CachedImage;
use crate::graph::{executor, types::*};
use crate::state::AppState;

#[tauri::command]
pub async fn load_image(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let img_arc = Arc::new(img);
    let mut lock = state.source_image.lock().map_err(|e| e.to_string())?;
    *lock = Some(CachedImage { image: img_arc });
    Ok(())
}

#[tauri::command]
pub async fn execute_graph(
    payload: ExecuteGraphPayload,
    state: State<'_, AppState>,
) -> Result<ExecutionResult, String> {
    let source = {
        let lock = state.source_image.lock().map_err(|e| e.to_string())?;
        lock.as_ref().ok_or("No image loaded")?.image.clone()
    };

    let result = executor::execute(&payload.graph, source, payload.preview)?;
    let (w, h) = (result.width(), result.height());

    let mut buf = Cursor::new(Vec::new());
    result
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(buf.into_inner());

    Ok(ExecutionResult {
        image_b64: format!("data:image/jpeg;base64,{}", b64),
        width: w,
        height: h,
    })
}

#[tauri::command]
pub async fn export_image(
    payload: ExecuteGraphPayload,
    output_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let source = {
        let lock = state.source_image.lock().map_err(|e| e.to_string())?;
        lock.as_ref().ok_or("No image loaded")?.image.clone()
    };

    let result = executor::execute(&payload.graph, source, false)?;
    result.save(&output_path).map_err(|e| e.to_string())
}
