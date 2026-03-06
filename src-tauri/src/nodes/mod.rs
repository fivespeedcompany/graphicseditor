use std::sync::Arc;
use image::DynamicImage;

pub trait NodeExecutor: Send + Sync {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String>;
}

pub mod color;
pub mod effect;
pub mod filter;
pub mod input;
