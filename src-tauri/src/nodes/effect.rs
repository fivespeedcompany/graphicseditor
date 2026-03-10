use super::NodeExecutor;
use image::{DynamicImage, ImageBuffer};
use rayon::prelude::*;
use std::sync::Arc;

// --- Vignette ---

pub struct VignetteNode {
    pub amount: f32,
    pub softness: f32,
}

impl NodeExecutor for VignetteNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        if self.amount <= 0.0 {
            return Ok(input);
        }
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let cx = w as f32 / 2.0;
        let cy = h as f32 / 2.0;
        let max_dist = (cx * cx + cy * cy).sqrt();
        let strength = (self.amount / 100.0).clamp(0.0, 1.0);
        let softness = (self.softness / 100.0).clamp(0.01, 1.0);
        let wu = w as usize;

        let mut raw = rgba.into_raw();
        raw.par_chunks_exact_mut(4)
            .enumerate()
            .for_each(|(i, p)| {
                let dx = (i % wu) as f32 - cx;
                let dy = (i / wu) as f32 - cy;
                let dist = (dx * dx + dy * dy).sqrt() / max_dist;
                let vignette = 1.0 - (dist / softness).min(1.0) * strength;
                p[0] = (p[0] as f32 * vignette).clamp(0.0, 255.0) as u8;
                p[1] = (p[1] as f32 * vignette).clamp(0.0, 255.0) as u8;
                p[2] = (p[2] as f32 * vignette).clamp(0.0, 255.0) as u8;
            });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, raw).unwrap(),
        )))
    }
}
