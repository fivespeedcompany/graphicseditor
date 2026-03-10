use super::NodeExecutor;
use image::{DynamicImage, ImageBuffer, imageops};
use rayon::prelude::*;
use std::sync::Arc;

// --- MixBlend ---
// Blends Layer A and Layer B. mode: 0=Normal, 1=Multiply, 2=Screen, 3=Overlay, 4=Difference
// If only one input is connected, passes it through unchanged.

pub struct MixBlendNode {
    pub opacity: f32,
    pub mode: f32,
}

impl NodeExecutor for MixBlendNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let mut iter = inputs.into_iter();
        let a = iter.next().ok_or("MixBlend: no input")?;
        let b = match iter.next() {
            Some(b) => b,
            None => return Ok(a), // only one input — pass through
        };

        let img_a = a.to_rgba8();
        let (w, h) = (img_a.width(), img_a.height());

        // Resize B to match A so the zip covers the full image
        let img_b_src = b.to_rgba8();
        let img_b = if img_b_src.width() != w || img_b_src.height() != h {
            imageops::resize(&img_b_src, w, h, imageops::FilterType::Triangle)
        } else {
            img_b_src
        };

        let t = (self.opacity / 100.0).clamp(0.0, 1.0);
        let mode = self.mode as i32;

        let a_raw = img_a.into_raw();
        let b_raw = img_b.into_raw();
        let mut out_raw = a_raw.clone();

        out_raw
            .par_chunks_exact_mut(4)
            .zip(a_raw.par_chunks_exact(4))
            .zip(b_raw.par_chunks_exact(4))
            .for_each(|((out, a_px), b_px)| {
                for ch in 0..3 {
                    let a = a_px[ch] as f32 / 255.0;
                    let b = b_px[ch] as f32 / 255.0;
                    let blended = match mode {
                        1 => a * b,                                         // Multiply
                        2 => 1.0 - (1.0 - a) * (1.0 - b),                 // Screen
                        3 => if a < 0.5 { 2.0*a*b } else { 1.0-2.0*(1.0-a)*(1.0-b) }, // Overlay
                        4 => (a - b).abs(),                                 // Difference
                        _ => b,                                             // Normal: use B
                    };
                    out[ch] = ((a * (1.0 - t) + blended * t) * 255.0).clamp(0.0, 255.0) as u8;
                }
                out[3] = a_px[3]; // preserve A's alpha
            });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, out_raw).unwrap(),
        )))
    }
}

// --- Mask ---
// Uses the mask input's luminosity as an alpha multiplier for the image input.
// If no mask is connected, passes the image through unchanged.

pub struct MaskNode {
    pub invert: f32,
}

impl NodeExecutor for MaskNode {
    fn execute(&self, inputs: Vec<Arc<DynamicImage>>) -> Result<Arc<DynamicImage>, String> {
        let mut iter = inputs.into_iter();
        let image = iter.next().ok_or("Mask: no image input")?;
        let mask = match iter.next() {
            Some(m) => m,
            None => return Ok(image),
        };

        let img = image.to_rgba8();
        let msk = mask.to_rgba8();
        let (w, h) = (img.width(), img.height());
        let do_invert = self.invert > 50.0;

        let img_raw = img.into_raw();
        let msk_raw = msk.into_raw();
        let mut out_raw = img_raw.clone();

        out_raw
            .par_chunks_exact_mut(4)
            .zip(img_raw.par_chunks_exact(4))
            .zip(msk_raw.par_chunks_exact(4))
            .for_each(|((out, img_px), msk_px)| {
                let luma = (0.2126 * msk_px[0] as f32
                    + 0.7152 * msk_px[1] as f32
                    + 0.0722 * msk_px[2] as f32) / 255.0;
                let alpha = if do_invert { 1.0 - luma } else { luma };
                for ch in 0..3 {
                    out[ch] = (img_px[ch] as f32 * alpha).clamp(0.0, 255.0) as u8;
                }
                out[3] = img_px[3];
            });

        Ok(Arc::new(DynamicImage::ImageRgba8(
            ImageBuffer::from_raw(w, h, out_raw).unwrap(),
        )))
    }
}
