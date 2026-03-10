use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use image::DynamicImage;
use crate::graph::cache::CachedImage;

pub struct AppState {
    pub source_image: Mutex<Option<CachedImage>>,
    pub node_images: Mutex<HashMap<String, Arc<DynamicImage>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            source_image: Mutex::new(None),
            node_images: Mutex::new(HashMap::new()),
        }
    }
}
