use super::NodeExecutor;
use image::{DynamicImage, ImageBuffer, Rgba};
use std::sync::Arc;

// --- BrightnessContrast ---

pub struct BrightnessContrastNode {
    pub brightness: f32,
    pub contrast: f32,
}

impl NodeExecutor for BrightnessContrastNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let input = inputs.into_iter().next().ok_or("No input")?;
        let mut out = input.to_rgba8();

        let b = self.brightness / 100.0;
        let c = (self.contrast / 100.0) + 1.0;

        for pixel in out.pixels_mut() {
            let [r, g, b_ch, a] = pixel.0;
            let apply = |v: u8| -> u8 {
                let f = v as f32 / 255.0;
                let brightened = f + b;
                let contrasted = (brightened - 0.5) * c + 0.5;
                (contrasted.clamp(0.0, 1.0) * 255.0) as u8
            };
            *pixel = Rgba([apply(r), apply(g), apply(b_ch), a]);
        }

        Ok(Arc::new(DynamicImage::ImageRgba8(out)))
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
        let mixed = ImageBuffer::from_fn(gray.width(), gray.height(), |x, y| {
            let g = gray.get_pixel(x, y);
            let o = original.get_pixel(x, y);
            Rgba([
                (g[0] as f32 * amount + o[0] as f32 * (1.0 - amount)) as u8,
                (g[1] as f32 * amount + o[1] as f32 * (1.0 - amount)) as u8,
                (g[2] as f32 * amount + o[2] as f32 * (1.0 - amount)) as u8,
                o[3],
            ])
        });
        Ok(Arc::new(DynamicImage::ImageRgba8(mixed)))
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
        let result = ImageBuffer::from_fn(rgba.width(), rgba.height(), |x, y| {
            let p = rgba.get_pixel(x, y);
            let r = p[0] as f32 / 255.0;
            let g = p[1] as f32 / 255.0;
            let b = p[2] as f32 / 255.0;
            let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            Rgba([
                ((luma + factor * (r - luma)).clamp(0.0, 1.0) * 255.0) as u8,
                ((luma + factor * (g - luma)).clamp(0.0, 1.0) * 255.0) as u8,
                ((luma + factor * (b - luma)).clamp(0.0, 1.0) * 255.0) as u8,
                p[3],
            ])
        });
        Ok(Arc::new(DynamicImage::ImageRgba8(result)))
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
        let shift = self.degrees / 360.0;
        let result = ImageBuffer::from_fn(rgba.width(), rgba.height(), |x, y| {
            let p = rgba.get_pixel(x, y);
            let (h, s, v) = rgb_to_hsv(p[0], p[1], p[2]);
            let h2 = (h + shift).rem_euclid(1.0);
            let (r, g, b) = hsv_to_rgb(h2, s, v);
            Rgba([r, g, b, p[3]])
        });
        Ok(Arc::new(DynamicImage::ImageRgba8(result)))
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
        let result = ImageBuffer::from_fn(rgba.width(), rgba.height(), |x, y| {
            let p = rgba.get_pixel(x, y);
            Rgba([
                ((255 - p[0]) as f32 * amount + p[0] as f32 * (1.0 - amount)).clamp(0.0, 255.0)
                    as u8,
                ((255 - p[1]) as f32 * amount + p[1] as f32 * (1.0 - amount)).clamp(0.0, 255.0)
                    as u8,
                ((255 - p[2]) as f32 * amount + p[2] as f32 * (1.0 - amount)).clamp(0.0, 255.0)
                    as u8,
                p[3],
            ])
        });
        Ok(Arc::new(DynamicImage::ImageRgba8(result)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::DynamicImage;

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
