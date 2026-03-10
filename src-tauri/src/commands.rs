use base64::{engine::general_purpose, Engine};
use std::io::Cursor;
use std::sync::Arc;
use tauri::State;

use crate::graph::cache::CachedImage;
use crate::graph::{executor, types::*};
use crate::state::AppState;

#[derive(Debug, serde::Serialize)]
pub struct NodeImageResult {
    pub thumbnail_b64: String,
}

#[tauri::command]
pub async fn load_image(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let img_arc = Arc::new(img);
    let mut lock = state.source_image.lock().map_err(|e| e.to_string())?;
    *lock = Some(CachedImage { image: img_arc });
    Ok(())
}

#[tauri::command]
pub async fn load_node_image(
    node_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<NodeImageResult, String> {
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let img_arc = Arc::new(img);

    // Encode a small thumbnail (max 200px) for the node card preview
    let thumb = img_arc.resize(200, 200, image::imageops::FilterType::Nearest);
    let mut buf = Cursor::new(Vec::<u8>::new());
    let rgb = thumb.to_rgb8();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 75)
        .encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(buf.into_inner());

    let mut lock = state.node_images.lock().map_err(|e| e.to_string())?;
    lock.insert(node_id, img_arc);

    Ok(NodeImageResult {
        thumbnail_b64: format!("data:image/jpeg;base64,{}", b64),
    })
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
    let node_images = {
        let lock = state.node_images.lock().map_err(|e| e.to_string())?;
        lock.clone()
    };

    let result = executor::execute(&payload.graph, source, &node_images, payload.preview)?;
    let (w, h) = (result.width(), result.height());

    let mut buf = Cursor::new(Vec::<u8>::new());
    let rgb = result.to_rgb8();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 70)
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
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
    let node_images = {
        let lock = state.node_images.lock().map_err(|e| e.to_string())?;
        lock.clone()
    };

    let result = executor::execute(&payload.graph, source, &node_images, false)?;
    result.save(&output_path).map_err(|e| e.to_string())
}
