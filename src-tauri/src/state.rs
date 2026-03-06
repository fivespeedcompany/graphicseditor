use std::sync::Mutex;
use crate::graph::cache::CachedImage;

pub struct AppState {
    pub source_image: Mutex<Option<CachedImage>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            source_image: Mutex::new(None),
        }
    }
}
