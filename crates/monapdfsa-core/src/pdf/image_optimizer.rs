use std::io::Read;

use flate2::read::ZlibDecoder;
use image::codecs::jpeg::JpegEncoder;
use image::{ImageBuffer, RgbImage};
use lopdf::{Document, Object};

/// Common color space enumeration for PDF image decoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorModel {
    DeviceGray,
    DeviceRGB,
    DeviceCMYK,
}

/// Information needed to decode and re-encode an image.
#[derive(Debug, Clone)]
pub struct ImageStreamData<'a> {
    pub width: i64,
    pub height: i64,
    pub color_model: Option<ColorModel>,
    pub filters: &'a [String],
    pub content: &'a [u8],
}

/// Resolve the color space to a known `ColorModel`. Returns `None` for
/// palettes, separations, and other unhandled spaces.
pub fn resolve_color_space(doc: &Document, obj: &Object) -> Option<ColorModel> {
    match obj {
        Object::Name(name) => match name.as_slice() {
            b"DeviceGray" => Some(ColorModel::DeviceGray),
            b"DeviceRGB" => Some(ColorModel::DeviceRGB),
            b"DeviceCMYK" => Some(ColorModel::DeviceCMYK),
            _ => None,
        },
        Object::Reference(id) => doc
            .get_object(*id)
            .ok()
            .and_then(|o| resolve_color_space(doc, o)),
        Object::Array(items) => {
            let head = items.first()?.as_name().ok()?;
            if head != b"ICCBased" {
                return None;
            }
            let icc = items.get(1)?;
            let icc_obj = match icc {
                Object::Reference(id) => doc.get_object(*id).ok()?,
                other => other,
            };
            let n = icc_obj.as_stream().ok()?.dict.get(b"N").ok()?.as_i64().ok()?;
            match n {
                1 => Some(ColorModel::DeviceGray),
                3 => Some(ColorModel::DeviceRGB),
                4 => Some(ColorModel::DeviceCMYK),
                _ => None,
            }
        }
        _ => None,
    }
}

/// Decode raw PDF image stream bytes into an RGB image buffer.
#[allow(clippy::chunks_exact_to_as_chunks)]
pub fn decode_to_rgb(img: &ImageStreamData<'_>) -> Result<RgbImage, String> {
    let is_dct = img.filters.iter().any(|f| f == "DCTDecode" || f == "DCT");
    let is_flate = img.filters.iter().any(|f| f == "FlateDecode" || f == "Fl");

    let raw: Vec<u8> = if is_dct {
        img.content.to_vec()
    } else if is_flate {
        let mut d = ZlibDecoder::new(std::io::Cursor::new(img.content));
        let mut out = Vec::new();
        d.read_to_end(&mut out)
            .map_err(|e| format!("zlib decompress failed: {}", e))?;
        out
    } else {
        img.content.to_vec()
    };

    if is_dct {
        let dyn_img = image::load_from_memory(&raw)
            .map_err(|e| format!("JPEG decode failed: {}", e))?;
        return Ok(dyn_img.to_rgb8());
    }

    let w = img.width.max(1) as u32;
    let h = img.height.max(1) as u32;
    let total_pixels = (w as usize) * (h as usize);

    match img.color_model {
        Some(ColorModel::DeviceGray) => {
            if raw.len() < total_pixels {
                return Err(format!(
                    "Grayscale buffer too small: {} < {}",
                    raw.len(),
                    total_pixels
                ));
            }
            let mut buf = Vec::with_capacity(total_pixels * 3);
            for &g in raw.iter().take(total_pixels) {
                buf.extend_from_slice(&[g, g, g]);
            }
            ImageBuffer::from_raw(w, h, buf).ok_or_else(|| "Gray buffer init failed".to_string())
        }
        Some(ColorModel::DeviceCMYK) => {
            let need_cmyk = total_pixels * 4;
            if raw.len() < need_cmyk {
                return Err(format!("CMYK buffer too small: {} < {}", raw.len(), need_cmyk));
            }
            let mut buf = Vec::with_capacity(total_pixels * 3);
            for chunk in raw.chunks_exact(4).take(total_pixels) {
                let c = chunk[0] as f32 / 255.0;
                let m = chunk[1] as f32 / 255.0;
                let y = chunk[2] as f32 / 255.0;
                let k = chunk[3] as f32 / 255.0;
                let r = ((1.0 - c) * (1.0 - k) * 255.0).clamp(0.0, 255.0) as u8;
                let g = ((1.0 - m) * (1.0 - k) * 255.0).clamp(0.0, 255.0) as u8;
                let b = ((1.0 - y) * (1.0 - k) * 255.0).clamp(0.0, 255.0) as u8;
                buf.extend_from_slice(&[r, g, b]);
            }
            ImageBuffer::from_raw(w, h, buf).ok_or_else(|| "CMYK buffer init failed".to_string())
        }
        _ => {
            let need_rgb = total_pixels * 3;
            if raw.len() >= need_rgb {
                let buf = raw[..need_rgb].to_vec();
                ImageBuffer::from_raw(w, h, buf).ok_or_else(|| "RGB buffer init failed".to_string())
            } else {
                image::load_from_memory(&raw)
                    .map(|img| img.to_rgb8())
                    .map_err(|e| format!("Image parse failed: {}", e))
            }
        }
    }
}

/// Encode an RGB image into JPEG bytes with the specified quality.
pub fn encode_jpeg(rgb: &RgbImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut enc = JpegEncoder::new_with_quality(&mut out, quality);
    enc.encode(
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        image::ExtendedColorType::Rgb8,
    )
    .map_err(|e| format!("JPEG encode failed: {}", e))?;
    Ok(out)
}

/// Optimize an image by downscaling to max_dim (if specified) and JPEG re-encoding.
pub fn optimize_image(rgb: &RgbImage, max_dim: Option<u32>, jpeg_q: u8) -> Result<(u32, u32, Vec<u8>), String> {
    let (w, h) = rgb.dimensions();
    let (tw, th) = if let Some(md) = max_dim {
        if w > md || h > md {
            if w >= h {
                (md, (h as u64 * md as u64 / w as u64) as u32)
            } else {
                ((w as u64 * md as u64 / h as u64) as u32, md)
            }
        } else {
            (w, h)
        }
    } else {
        (w, h)
    };

    let (tw, th) = (tw.max(1), th.max(1));
    let resized = if tw == w && th == h {
        rgb.clone()
    } else {
        image::imageops::resize(rgb, tw, th, image::imageops::FilterType::Triangle)
    };

    let jpeg = encode_jpeg(&resized, jpeg_q)?;
    Ok((tw, th, jpeg))
}
