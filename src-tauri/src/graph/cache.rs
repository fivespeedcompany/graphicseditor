use std::sync::Arc;
use image::DynamicImage;

pub struct CachedImage {
    pub image: Arc<DynamicImage>,
}
