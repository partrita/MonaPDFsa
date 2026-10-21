use std::io::Write;

use lopdf::{Dictionary, Document, Object, ObjectId, Stream};

use crate::pdf::image_optimizer::{
    decode_to_rgb, optimize_image, resolve_color_space, ColorModel, ImageStreamData,
};
use crate::pdf::redact::{apply_redactions_to_doc, FlattenedPageSpec, RedactionRegion};

/// Map compression level (0-100) to max dimension and JPEG quality.
fn level_params(level: u8) -> (Option<u32>, u8) {
    let level = level.min(100);
    if level == 0 {
        return (None, 90);
    }

    let max_dim = if level <= 20 {
        Some(2000)
    } else if level <= 40 {
        Some(1600)
    } else if level <= 60 {
        Some(1200)
    } else if level <= 80 {
        Some(900)
    } else {
        Some(650)
    };

    let q = (85 - (level as i32 * 60 / 100)).clamp(22, 88) as u8;
    (max_dim, q)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CompressionOptions {
    pub level: u8,
    pub output_path: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CompressionResult {
    pub output_path: String,
    pub original_size: u64,
    pub compressed_size: u64,
    pub reduction_percent: f64,
    pub pages: usize,
    pub image_count: usize,
    /// The tagged-PDF logical structure tree was removed. Page content is intact.
    pub structure_stripped: bool,
}

#[derive(Debug, Clone)]
struct ImageInfo {
    id: ObjectId,
    width: i64,
    height: i64,
    color_model: Option<ColorModel>,
    filters: Vec<String>,
    content: Vec<u8>,
    /// Lossy re-encoding would corrupt this image (mask, alpha, or an
    /// unsupported encoding). Keep the original bytes.
    skip: bool,
}

/// True when Flate data uses a PNG/TIFF predictor that this decoder skips.
fn has_predictor(dict: &Dictionary) -> bool {
    let params = match dict.get(b"DecodeParms") {
        Ok(Object::Dictionary(d)) => vec![d],
        Ok(Object::Array(items)) => items.iter().filter_map(|o| o.as_dict().ok()).collect(),
        _ => return false,
    };
    params.iter().any(|d| {
        d.get(b"Predictor")
            .ok()
            .and_then(|o| o.as_i64().ok())
            .is_some_and(|p| p > 1)
    })
}

/// Remove the tagged-PDF logical structure tree.
///
/// Rendering, text search, and selection do not use this tree. The page
/// content and the text operators stay intact. Accessibility tags are lost.
fn strip_logical_structure(doc: &mut Document) -> bool {
    let Some(root_id) = doc
        .trailer
        .get(b"Root")
        .ok()
        .and_then(|o| o.as_reference().ok())
    else {
        return false;
    };
    let Some(catalog) = doc
        .get_object_mut(root_id)
        .ok()
        .and_then(|o| o.as_dict_mut().ok())
    else {
        return false;
    };
    let removed = catalog.get(b"StructTreeRoot").is_ok();
    catalog.remove(b"StructTreeRoot");
    catalog.remove(b"MarkInfo");
    removed
}

/// Compress a single PDF file to `output_path`.
pub fn compress_pdf(input_path: &str, opts: &CompressionOptions) -> Result<CompressionResult, String> {
    compress_pdf_with_redactions(input_path, opts, &[], &[])
}

/// Compress a PDF file with optional redactions applied first.
///
/// If redaction specifications are provided, apply them to the document
/// before image re-encoding, object pruning, and stream compression.
pub fn compress_pdf_with_redactions(
    input_path: &str,
    opts: &CompressionOptions,
    flattened_pages: &[FlattenedPageSpec],
    redactions: &[RedactionRegion],
) -> Result<CompressionResult, String> {
    let original_bytes = std::fs::read(input_path)
        .map_err(|e| format!("원본 PDF 읽기 실패 '{}': {}", input_path, e))?;
    let original_size = original_bytes.len() as u64;

    let mut doc = Document::load_mem(&original_bytes)
        .map_err(|e| format!("PDF 로드 실패: {}", e))?;

    // Apply redactions if any are provided.
    if !flattened_pages.is_empty() || !redactions.is_empty() {
        apply_redactions_to_doc(&mut doc, flattened_pages, redactions)?;
    }

    // Drop the logical structure tree at any lossy level.
    let structure_stripped = opts.level > 0 && strip_logical_structure(&mut doc);

    let pages = doc.get_pages().len();
    let (max_dim, jpeg_q) = level_params(opts.level);

    // Document image search
    let mut seen_ids = std::collections::HashSet::new();
    let mut masked_ids: std::collections::HashSet<ObjectId> = std::collections::HashSet::new();
    let mut images: Vec<ImageInfo> = Vec::new();

    fn collect_mask_refs(obj: &Object, out: &mut std::collections::HashSet<ObjectId>) {
        match obj {
            Object::Reference(id) => {
                out.insert(*id);
            }
            Object::Array(items) => {
                for item in items {
                    collect_mask_refs(item, out);
                }
            }
            _ => {}
        }
    }

    for (&id, obj) in &doc.objects {
        if let Object::Stream(ref stream) = obj {
            let is_image = stream
                .dict
                .get(b"Subtype")
                .ok()
                .and_then(|o| o.as_name().ok())
                .is_some_and(|name| name == b"Image");

            if !is_image {
                continue;
            }

            for key in [b"SMask".as_slice(), b"Mask"] {
                if let Ok(mask) = stream.dict.get(key) {
                    collect_mask_refs(mask, &mut masked_ids);
                }
            }

            if !seen_ids.insert(id) {
                continue;
            }

            let get_int = |key: &[u8]| {
                stream
                    .dict
                    .get(key)
                    .ok()
                    .and_then(|o| match o {
                        Object::Integer(i) => Some(*i),
                        _ => None,
                    })
                    .unwrap_or(0)
            };
            let width = get_int(b"Width");
            let height = get_int(b"Height");

            let filters: Vec<String> = stream
                .filters()
                .ok()
                .map(|vec| {
                    vec.into_iter()
                        .filter_map(|bytes| String::from_utf8(bytes.to_vec()).ok())
                        .collect()
                })
                .unwrap_or_default();

            let is_dct = filters.iter().any(|name| name == "DCTDecode" || name == "DCT");
            let color_model = stream
                .dict
                .get(b"ColorSpace")
                .ok()
                .and_then(|o| resolve_color_space(&doc, o));

            let bits = stream
                .dict
                .get(b"BitsPerComponent")
                .ok()
                .and_then(|o| o.as_i64().ok())
                .unwrap_or(8);

            let image_mask = stream
                .dict
                .get(b"ImageMask")
                .ok()
                .and_then(|o| o.as_bool().ok())
                .unwrap_or(false);

            let has_mask = image_mask
                || stream.dict.get(b"SMask").is_ok()
                || stream.dict.get(b"Mask").is_ok();

            // Lossy decoding is safe only for plain 8-bit DCT or RGB-model data.
            let skip = has_mask
                || (!is_dct
                    && (color_model.is_none() || bits != 8 || has_predictor(&stream.dict)));

            images.push(ImageInfo {
                id,
                width,
                height,
                color_model,
                filters,
                content: stream.content.clone(),
                skip,
            });
        }
    }

    // Mask images must stay in their original form.
    for img in &mut images {
        if masked_ids.contains(&img.id) {
            img.skip = true;
        }
    }

    let mut image_count = 0usize;

    // Optimize images if compression level > 0
    if opts.level > 0 {
        for img in &images {
            if img.skip {
                continue;
            }

            let stream_data = ImageStreamData {
                width: img.width,
                height: img.height,
                color_model: img.color_model,
                filters: &img.filters,
                content: &img.content,
            };

            let rgb = match decode_to_rgb(&stream_data) {
                Ok(r) => r,
                Err(_) => continue,
            };

            let (tw, th, jpeg) = match optimize_image(&rgb, max_dim, jpeg_q) {
                Ok(res) => res,
                Err(_) => continue,
            };

            // Keep the original bytes when re-encoding is not smaller.
            if jpeg.len() < img.content.len() {
                let mut dict = Dictionary::new();
                dict.set("Type", Object::Name(b"XObject".to_vec()));
                dict.set("Subtype", Object::Name(b"Image".to_vec()));
                dict.set("Width", tw as i64);
                dict.set("Height", th as i64);
                dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
                dict.set("BitsPerComponent", 8);
                dict.set("Filter", Object::Name(b"DCTDecode".to_vec()));

                doc.set_object(img.id, Object::Stream(Stream::new(dict, jpeg)));
                image_count += 1;
            }
        }
    }

    // Object cleanup and stream deflation
    doc.prune_objects();
    doc.compress();

    // Save with modern object and cross-reference streams.
    let file = std::fs::File::create(&opts.output_path)
        .map_err(|e| format!("압축된 PDF 저장 실패: {}", e))?;
    let mut writer = std::io::BufWriter::new(file);
    doc.save_modern(&mut writer)
        .map_err(|e| format!("압축된 PDF 저장 실패: {}", e))?;
    writer
        .flush()
        .map_err(|e| format!("압축된 PDF 저장 실패: {}", e))?;

    let compressed_size = std::fs::read(&opts.output_path)
        .map_err(|e| format!("출력 파일 읽기 실패: {}", e))?
        .len() as u64;

    // A compression pass must not grow the file.
    let compressed_size = if compressed_size >= original_size
        && flattened_pages.is_empty()
        && redactions.is_empty()
    {
        std::fs::write(&opts.output_path, &original_bytes)
            .map_err(|e| format!("원본 PDF 복원 실패: {}", e))?;
        original_size
    } else {
        compressed_size
    };

    let reduction_percent = if original_size > 0 && compressed_size < original_size {
        (1.0 - compressed_size as f64 / original_size as f64) * 100.0
    } else {
        0.0
    };

    Ok(CompressionResult {
        output_path: opts.output_path.clone(),
        original_size,
        compressed_size,
        reduction_percent,
        pages,
        image_count,
        structure_stripped,
    })
}
