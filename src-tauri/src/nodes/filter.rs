use super::NodeExecutor;
use image::{DynamicImage, ImageBuffer};
use rayon::prelude::*;
use std::sync::Arc;

// --- Blur (Gaussian) ---

pub struct BlurNode {
    pub radius: f32,
}

impl NodeExecutor for BlurNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        if self.radius <= 0.0 {
            return Ok(input);
        }
        let rgba = input.to_rgba8();
        let blurred = imageproc::filter::gaussian_blur_f32(&rgba, self.radius);
        Ok(Arc::new(DynamicImage::ImageRgba8(blurred)))
    }
}

// --- Sharpen (unsharp mask) ---

pub struct SharpenNode {
    pub amount: f32,
}

impl NodeExecutor for SharpenNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        if self.amount <= 0.0 {
            return Ok(input);
        }
        let rgba = input.to_rgba8();
        let blurred = imageproc::filter::gaussian_blur_f32(&rgba, 1.0);
        let strength = self.amount / 100.0;
        let (width, height) = (rgba.width(), rgba.height());

        let rgba_raw = rgba.into_raw();
        let blur_raw = blurred.into_raw();
        let mut result_raw = rgba_raw.clone();

        result_raw
            .par_chunks_exact_mut(4)
            .zip(rgba_raw.par_chunks_exact(4))
            .zip(blur_raw.par_chunks_exact(4))
            .for_each(|((out, orig), blur)| {
                for ch in 0..3 {
                    out[ch] = (orig[ch] as f32 + strength * (orig[ch] as f32 - blur[ch] as f32))
                        .clamp(0.0, 255.0) as u8;
                }
                out[3] = orig[3];
            });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(width, height, result_raw)
                .ok_or("Failed to create sharpen buffer")?,
        )))
    }
}

// --- Noise (additive, deterministic per pixel) ---

pub struct NoiseNode {
    pub amount: f32,
}

impl NodeExecutor for NoiseNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        if self.amount <= 0.0 {
            return Ok(input);
        }
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let strength = self.amount / 100.0 * 128.0;
        let wu = w as usize;

        let mut raw = rgba.into_raw();
        raw.par_chunks_exact_mut(4)
            .enumerate()
            .for_each(|(i, p)| {
                let noise = pseudo_noise((i % wu) as u32, (i / wu) as u32) * strength;
                p[0] = (p[0] as f32 + noise).clamp(0.0, 255.0) as u8;
                p[1] = (p[1] as f32 + noise).clamp(0.0, 255.0) as u8;
                p[2] = (p[2] as f32 + noise).clamp(0.0, 255.0) as u8;
            });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, raw).unwrap(),
        )))
    }
}

/// Simple deterministic per-pixel noise in [-1, 1].
fn pseudo_noise(x: u32, y: u32) -> f32 {
    let mut n = x
        .wrapping_mul(2246822519)
        .wrapping_add(y.wrapping_mul(2654435761))
        .wrapping_add(1234567891);
    n ^= n >> 13;
    n = n.wrapping_mul(1664525).wrapping_add(1013904223);
    n ^= n >> 16;
    (n as f32 / u32::MAX as f32) * 2.0 - 1.0
}
