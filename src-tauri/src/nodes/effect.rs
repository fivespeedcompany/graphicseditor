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

// --- Pixelate ---

pub struct PixelateNode {
    pub size: f32,
}

impl NodeExecutor for PixelateNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let block = (self.size as u32).max(1);
        if block <= 1 {
            return Ok(input);
        }
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let mut out = rgba.clone();

        let bx_count = (w + block - 1) / block;
        let by_count = (h + block - 1) / block;

        // Average each block then flood-fill it
        for by in 0..by_count {
            for bx in 0..bx_count {
                let x0 = bx * block;
                let y0 = by * block;
                let x1 = (x0 + block).min(w);
                let y1 = (y0 + block).min(h);

                let mut r = 0u32; let mut g = 0u32; let mut b = 0u32; let mut a = 0u32; let mut n = 0u32;
                for py in y0..y1 {
                    for px in x0..x1 {
                        let p = rgba.get_pixel(px, py);
                        r += p[0] as u32; g += p[1] as u32; b += p[2] as u32; a += p[3] as u32;
                        n += 1;
                    }
                }
                let avg = image::Rgba([(r/n) as u8, (g/n) as u8, (b/n) as u8, (a/n) as u8]);
                for py in y0..y1 {
                    for px in x0..x1 {
                        out.put_pixel(px, py, avg);
                    }
                }
            }
        }

        Ok(Arc::new(DynamicImage::ImageRgba8(out)))
    }
}

// --- Dither (Bayer ordered) ---

pub struct DitherNode {
    pub levels: f32,
    pub strength: f32,
}

const BAYER4: [[f32; 4]; 4] = [
    [ 0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0],
    [12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0],
    [ 3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0],
    [15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0],
];

impl NodeExecutor for DitherNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let levels = (self.levels as f32).max(2.0);
        let step = 255.0 / (levels - 1.0);
        let strength = (self.strength / 100.0).clamp(0.0, 1.0);
        let wu = w as usize;

        let mut raw = rgba.into_raw();
        raw.par_chunks_exact_mut(4)
            .enumerate()
            .for_each(|(i, p)| {
                let x = i % wu;
                let y = i / wu;
                let threshold = BAYER4[y % 4][x % 4] * step;
                for ch in 0..3 {
                    let dithered = ((p[ch] as f32 + threshold) / step).floor() * step;
                    let dithered = dithered.clamp(0.0, 255.0) as u8;
                    p[ch] = ((dithered as f32 * strength) + (p[ch] as f32 * (1.0 - strength))) as u8;
                }
            });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, raw).unwrap(),
        )))
    }
}

// --- NoiseTexture (FBM overlay) ---

pub struct NoiseTextureNode {
    pub freq: f32,
    pub octaves: f32,
    pub intensity: f32,
}

fn pseudo_noise_f(x: u32, y: u32) -> f32 {
    let mut n = x.wrapping_mul(2246822519).wrapping_add(y.wrapping_mul(2654435761)).wrapping_add(1234567891);
    n ^= n >> 13;
    n = n.wrapping_mul(1664525).wrapping_add(1013904223);
    n ^= n >> 16;
    (n as f32 / u32::MAX as f32) * 2.0 - 1.0
}

fn fbm(x: f32, y: f32, freq: f32, octaves: u32) -> f32 {
    let mut val = 0.0f32;
    let mut amp = 1.0f32;
    let mut max_val = 0.0f32;
    let mut f = 1.0f32 / freq.max(0.01);
    for _ in 0..octaves {
        let nx = (x * f) as u32;
        let ny = (y * f) as u32;
        val += pseudo_noise_f(nx, ny) * amp;
        max_val += amp;
        amp *= 0.5;
        f *= 2.0;
    }
    (val / max_val).clamp(-1.0, 1.0) * 0.5 + 0.5 // normalize [0,1]
}

impl NodeExecutor for NoiseTextureNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let freq = self.freq.max(0.01);
        let octaves = (self.octaves as u32).max(1).min(8);
        let intensity = (self.intensity / 100.0).clamp(0.0, 1.0);
        let wu = w as usize;

        let mut raw = rgba.into_raw();
        raw.par_chunks_exact_mut(4)
            .enumerate()
            .for_each(|(i, p)| {
                let x = (i % wu) as f32;
                let y = (i / wu) as f32;
                let n = fbm(x, y, freq, octaves); // [0, 1]
                // overlay blend
                for ch in 0..3 {
                    let base = p[ch] as f32 / 255.0;
                    let blended = if base < 0.5 {
                        2.0 * base * n
                    } else {
                        1.0 - 2.0 * (1.0 - base) * (1.0 - n)
                    };
                    p[ch] = ((base * (1.0 - intensity) + blended * intensity) * 255.0).clamp(0.0, 255.0) as u8;
                }
            });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, raw).unwrap(),
        )))
    }
}
