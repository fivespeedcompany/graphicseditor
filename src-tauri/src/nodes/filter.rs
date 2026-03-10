use super::NodeExecutor;
use image::{DynamicImage, ImageBuffer, Rgba};
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
pub fn pseudo_noise(x: u32, y: u32) -> f32 {
    let mut n = x
        .wrapping_mul(2246822519)
        .wrapping_add(y.wrapping_mul(2654435761))
        .wrapping_add(1234567891);
    n ^= n >> 13;
    n = n.wrapping_mul(1664525).wrapping_add(1013904223);
    n ^= n >> 16;
    (n as f32 / u32::MAX as f32) * 2.0 - 1.0
}

// --- Transform (rotate + scale) ---

pub struct TransformNode {
    pub rotate: f32,
    pub scale: f32,
}

impl NodeExecutor for TransformNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());

        // Rotate
        let rotated = if self.rotate != 0.0 {
            let angle = self.rotate * std::f32::consts::PI / 180.0;
            imageproc::geometric_transformations::rotate_about_center(
                &rgba,
                angle,
                imageproc::geometric_transformations::Interpolation::Bilinear,
                Rgba([0, 0, 0, 0]),
            )
        } else {
            rgba
        };

        // Scale — resize then center-crop/pad back to original dims
        let scale = (self.scale / 100.0).max(0.01);
        let new_w = ((w as f32 * scale) as u32).max(1);
        let new_h = ((h as f32 * scale) as u32).max(1);

        let scaled = image::imageops::resize(
            &rotated,
            new_w,
            new_h,
            image::imageops::FilterType::Triangle,
        );

        // Paste scaled image centered onto a blank canvas of original size
        let mut canvas = ImageBuffer::from_pixel(w, h, Rgba([0, 0, 0, 255]));
        let ox = (w as i32 - new_w as i32) / 2;
        let oy = (h as i32 - new_h as i32) / 2;
        image::imageops::overlay(&mut canvas, &scaled, ox as i64, oy as i64);

        Ok(Arc::new(DynamicImage::ImageRgba8(canvas)))
    }
}

// --- Displace ---

pub struct DisplaceNode {
    pub amount: f32,
    pub freq: f32,
}

impl NodeExecutor for DisplaceNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let wu = w as usize;
        let hu = h as usize;
        let displacement = self.amount;
        let freq = self.freq.max(0.01);

        let src = rgba.into_raw();
        let mut dst = vec![0u8; wu * hu * 4];

        dst.par_chunks_exact_mut(4)
            .enumerate()
            .for_each(|(i, out)| {
                let x = (i % wu) as f32;
                let y = (i / wu) as f32;
                // Quantize to noise frequency grid
                let qx = (x / freq) as u32;
                let qy = (y / freq) as u32;
                let dx = pseudo_noise(qx, qy) * displacement;
                let dy = pseudo_noise(qx.wrapping_add(9973), qy.wrapping_add(9973)) * displacement;
                let sx = (x + dx).clamp(0.0, (wu - 1) as f32) as usize;
                let sy = (y + dy).clamp(0.0, (hu - 1) as f32) as usize;
                let si = (sy * wu + sx) * 4;
                out.copy_from_slice(&src[si..si + 4]);
            });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, dst).unwrap(),
        )))
    }
}
