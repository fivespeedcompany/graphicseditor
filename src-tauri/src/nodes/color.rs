use super::NodeExecutor;
use image::{DynamicImage, ImageBuffer};
use rayon::prelude::*;
use std::sync::Arc;

// --- BrightnessContrast ---

pub struct BrightnessContrastNode {
    pub brightness: f32,
    pub contrast: f32,
}

impl NodeExecutor for BrightnessContrastNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let b = self.brightness / 100.0;
        let c = (self.contrast / 100.0) + 1.0;

        let mut raw = rgba.into_raw();
        raw.par_chunks_exact_mut(4).for_each(|p| {
            let apply = |v: u8| -> u8 {
                let f = v as f32 / 255.0;
                ((((f + b) - 0.5) * c + 0.5).clamp(0.0, 1.0) * 255.0) as u8
            };
            p[0] = apply(p[0]);
            p[1] = apply(p[1]);
            p[2] = apply(p[2]);
        });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, raw).unwrap(),
        )))
    }
}

// --- Grayscale ---

pub struct GrayscaleNode {
    pub amount: f32,
}

impl NodeExecutor for GrayscaleNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let amount = (self.amount / 100.0).clamp(0.0, 1.0);
        let gray = input.grayscale().to_rgba8();
        let original = input.to_rgba8();
        let (w, h) = (original.width(), original.height());
        let gray_raw = gray.into_raw();
        let mut orig_raw = original.into_raw();

        orig_raw
            .par_chunks_exact_mut(4)
            .zip(gray_raw.par_chunks_exact(4))
            .for_each(|(o, g)| {
                o[0] = (g[0] as f32 * amount + o[0] as f32 * (1.0 - amount)) as u8;
                o[1] = (g[1] as f32 * amount + o[1] as f32 * (1.0 - amount)) as u8;
                o[2] = (g[2] as f32 * amount + o[2] as f32 * (1.0 - amount)) as u8;
            });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, orig_raw).unwrap(),
        )))
    }
}

// --- Saturation ---

pub struct SaturationNode {
    pub amount: f32,
}

impl NodeExecutor for SaturationNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let factor = self.amount / 100.0;
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());

        let mut raw = rgba.into_raw();
        raw.par_chunks_exact_mut(4).for_each(|p| {
            let r = p[0] as f32 / 255.0;
            let g = p[1] as f32 / 255.0;
            let b = p[2] as f32 / 255.0;
            let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            p[0] = ((luma + factor * (r - luma)).clamp(0.0, 1.0) * 255.0) as u8;
            p[1] = ((luma + factor * (g - luma)).clamp(0.0, 1.0) * 255.0) as u8;
            p[2] = ((luma + factor * (b - luma)).clamp(0.0, 1.0) * 255.0) as u8;
        });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, raw).unwrap(),
        )))
    }
}

// --- HueShift ---

pub struct HueShiftNode {
    pub degrees: f32,
}

impl NodeExecutor for HueShiftNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        if self.degrees == 0.0 {
            return Ok(input);
        }
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        let shift = self.degrees / 360.0;

        let mut raw = rgba.into_raw();
        raw.par_chunks_exact_mut(4).for_each(|p| {
            let (h, s, v) = rgb_to_hsv(p[0], p[1], p[2]);
            let (r, g, b) = hsv_to_rgb((h + shift).rem_euclid(1.0), s, v);
            p[0] = r;
            p[1] = g;
            p[2] = b;
        });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, raw).unwrap(),
        )))
    }
}

fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let r = r as f32 / 255.0;
    let g = g as f32 / 255.0;
    let b = b as f32 / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;
    let v = max;
    let s = if max == 0.0 { 0.0 } else { delta / max };
    let h = if delta == 0.0 {
        0.0
    } else if max == r {
        ((g - b) / delta).rem_euclid(6.0) / 6.0
    } else if max == g {
        ((b - r) / delta + 2.0) / 6.0
    } else {
        ((r - g) / delta + 4.0) / 6.0
    };
    (h, s, v)
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (u8, u8, u8) {
    let i = (h * 6.0).floor() as i32;
    let f = h * 6.0 - i as f32;
    let p = v * (1.0 - s);
    let q = v * (1.0 - f * s);
    let t = v * (1.0 - (1.0 - f) * s);
    let (r, g, b) = match i % 6 {
        0 => (v, t, p),
        1 => (q, v, p),
        2 => (p, v, t),
        3 => (p, q, v),
        4 => (t, p, v),
        _ => (v, p, q),
    };
    ((r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8)
}

// --- Invert ---

pub struct InvertNode {
    pub amount: f32,
}

impl NodeExecutor for InvertNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let amount = (self.amount / 100.0).clamp(0.0, 1.0);
        if amount == 0.0 {
            return Ok(input);
        }
        let rgba = input.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());

        let mut raw = rgba.into_raw();
        raw.par_chunks_exact_mut(4).for_each(|p| {
            let blend = |v: u8| -> u8 {
                ((255 - v) as f32 * amount + v as f32 * (1.0 - amount)).clamp(0.0, 255.0) as u8
            };
            p[0] = blend(p[0]);
            p[1] = blend(p[1]);
            p[2] = blend(p[2]);
        });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, raw).unwrap(),
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgba};

    #[test]
    fn test_grayscale_full_amount() {
        let img = DynamicImage::new_rgba8(4, 4);
        let node = GrayscaleNode { amount: 100.0 };
        let result = node.execute(vec![Arc::new(img)]).unwrap();
        let rgba = result.to_rgba8();
        for pixel in rgba.pixels() {
            assert_eq!(pixel[0], pixel[1]);
            assert_eq!(pixel[1], pixel[2]);
        }
    }

    #[test]
    fn test_invert_full_amount() {
        let mut img = DynamicImage::new_rgba8(2, 2).to_rgba8();
        for p in img.pixels_mut() {
            *p = Rgba([100, 150, 200, 255]);
        }
        let node = InvertNode { amount: 100.0 };
        let result = node
            .execute(vec![Arc::new(DynamicImage::ImageRgba8(img))])
            .unwrap();
        let rgba = result.to_rgba8();
        let p = rgba.get_pixel(0, 0);
        assert_eq!(p[0], 155);
        assert_eq!(p[1], 105);
        assert_eq!(p[2], 55);
    }
}
