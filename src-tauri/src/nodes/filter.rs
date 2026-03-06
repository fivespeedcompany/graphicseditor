use super::NodeExecutor;
use image::{DynamicImage, ImageBuffer, Rgba};
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
        let result = ImageBuffer::from_fn(rgba.width(), rgba.height(), |x, y| {
            let orig = rgba.get_pixel(x, y);
            let blur = blurred.get_pixel(x, y);
            Rgba([
                (orig[0] as f32 + strength * (orig[0] as f32 - blur[0] as f32))
                    .clamp(0.0, 255.0) as u8,
                (orig[1] as f32 + strength * (orig[1] as f32 - blur[1] as f32))
                    .clamp(0.0, 255.0) as u8,
                (orig[2] as f32 + strength * (orig[2] as f32 - blur[2] as f32))
                    .clamp(0.0, 255.0) as u8,
                orig[3],
            ])
        });
        Ok(Arc::new(DynamicImage::ImageRgba8(result)))
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
        let strength = self.amount / 100.0 * 128.0;
        let result = ImageBuffer::from_fn(rgba.width(), rgba.height(), |x, y| {
            let pixel = rgba.get_pixel(x, y);
            let noise = pseudo_noise(x, y) * strength;
            Rgba([
                (pixel[0] as f32 + noise).clamp(0.0, 255.0) as u8,
                (pixel[1] as f32 + noise).clamp(0.0, 255.0) as u8,
                (pixel[2] as f32 + noise).clamp(0.0, 255.0) as u8,
                pixel[3],
            ])
        });
        Ok(Arc::new(DynamicImage::ImageRgba8(result)))
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
