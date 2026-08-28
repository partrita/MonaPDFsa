use base64::prelude::*;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::GenericImageView;
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Write;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedactionRegion {
    pub id: String,
    pub page: u32,                  // 1-based page index
    pub x: f64,                     // PDF coordinate X (points, origin bottom-left)
    pub y: f64,                     // PDF coordinate Y (points, origin bottom-left)
    pub width: f64,                 // PDF points
    pub height: f64,                // PDF points
    pub style: String,              // "mosaic", "blackout", "whiteout"
    pub image_data: Option<String>, // Base64 data URL (e.g. "data:image/png;base64,...")
}

/// Compress bytes with zlib (FlateDecode) for embedding in a PDF stream.
fn zlib_compress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(data)
        .map_err(|e| format!("zlib write error: {}", e))?;
    encoder
        .finish()
        .map_err(|e| format!("zlib finish error: {}", e))
}

/// Resolve a page's effective /Resources, walking the page tree for inherited
/// resources (per PDF spec, /Resources is inherited from ancestor nodes) and
/// dereferencing resource references. Returns a cloned dictionary so the caller
/// can safely detach it onto the page.
fn resolve_page_resources(doc: &Document, mut node: ObjectId) -> Option<Dictionary> {
    let mut seen = std::collections::HashSet::new();
    loop {
        if !seen.insert(node) {
            return None;
        }
        let page = doc
            .get_object(node)
            .ok()
            .or_else(|| doc.objects.get(&node))?;
        match page {
            Object::Dictionary(dict) => {
                if let Ok(resources) = dict.get_deref(b"Resources", doc).and_then(Object::as_dict) {
                    return Some(resources.clone());
                }
                // Parent must be read as a raw reference (get_deref would return
                // the referenced dictionary, losing the id to walk up to).
                if let Ok(parent) = dict.get(b"Parent").and_then(Object::as_reference) {
                    node = parent;
                } else {
                    return None;
                }
            }
            Object::Reference(id) => node = *id,
            _ => return None,
        }
    }
}

/// Applies redaction regions (mosaic, blackout, whiteout) onto the PDF document.
pub fn apply_redactions(
    input_path: &str,
    output_path: &str,
    redactions: &[RedactionRegion],
) -> Result<String, String> {
    let mut doc = Document::load(input_path)
        .map_err(|e| format!("Failed to load PDF '{}': {}", input_path, e))?;

    let pages = doc.get_pages();
    let mut max_id = doc.max_id;

    // Group redactions by page
    let mut by_page: BTreeMap<u32, Vec<&RedactionRegion>> = BTreeMap::new();
    for r in redactions {
        by_page.entry(r.page).or_default().push(r);
    }

    for (page_num, regions) in by_page {
        let page_id = match pages.get(&page_num) {
            Some(&id) => id,
            None => continue,
        };

        let mut draw_commands = String::new();
        // (resource_name, object_id) pairs for mosaic images
        let mut images_to_add: Vec<(String, ObjectId)> = Vec::new();

        // --- Build draw commands and register image XObjects ---
        for (idx, r) in regions.iter().enumerate() {
            match r.style.as_str() {
                "blackout" => {
                    // Solid black rectangle
                    draw_commands.push_str(&format!(
                        "q 0 0 0 rg {:.3} {:.3} {:.3} {:.3} re f Q\n",
                        r.x, r.y, r.width, r.height
                    ));
                }
                "whiteout" => {
                    // Solid white rectangle
                    draw_commands.push_str(&format!(
                        "q 1 1 1 rg {:.3} {:.3} {:.3} {:.3} re f Q\n",
                        r.x, r.y, r.width, r.height
                    ));
                }
                "mosaic" => {
                    let mut drawn = false;
                    if let Some(ref data_url) = r.image_data {
                        let b64_str = if let Some(pos) = data_url.find(',') {
                            &data_url[pos + 1..]
                        } else {
                            data_url.as_str()
                        };

                        if let Ok(bytes) = BASE64_STANDARD.decode(b64_str) {
                            if let Ok(img) = image::load_from_memory(&bytes) {
                                let (w, h) = img.dimensions();
                                let rgb = img.to_rgb8();

                                if let Ok(compressed) = zlib_compress(&rgb) {
                                    max_id += 1;
                                    let img_id = (max_id, 0);

                                    let img_stream = Stream::new(
                                        dictionary! {
                                            "Type" => "XObject",
                                            "Subtype" => "Image",
                                            "Width" => w as i64,
                                            "Height" => h as i64,
                                            "ColorSpace" => "DeviceRGB",
                                            "BitsPerComponent" => 8,
                                            "Filter" => "FlateDecode",
                                        },
                                        compressed,
                                    );

                                    doc.objects.insert(img_id, Object::Stream(img_stream));
                                    let res_name = format!("RedactImg_{}_{}", page_num, idx);
                                    images_to_add.push((res_name.clone(), img_id));

                                    // PDF cm operator: scale-x 0 0 scale-y translate-x translate-y cm
                                    draw_commands.push_str(&format!(
                                        "q {:.3} 0 0 {:.3} {:.3} {:.3} cm /{} Do Q\n",
                                        r.width, r.height, r.x, r.y, res_name
                                    ));
                                    drawn = true;
                                }
                            }
                        }
                    }

                    if !drawn {
                        // Fallback to dark gray fill if image data could not be parsed
                        draw_commands.push_str(&format!(
                            "q 0.1 0.1 0.1 rg {:.3} {:.3} {:.3} {:.3} re f Q\n",
                            r.x, r.y, r.width, r.height
                        ));
                    }
                }
                _ => {}
            }
        }

        if draw_commands.is_empty() {
            continue;
        }

        // --- Create new content stream (FlateDecode compressed) ---
        // This is the critical fix: raw uncompressed streams are silently ignored
        // by many PDF viewers when the document uses compressed streams elsewhere.
        let compressed_ops =
            zlib_compress(draw_commands.as_bytes()).unwrap_or_else(|_| draw_commands.into_bytes());

        max_id += 1;
        let stream_id = (max_id, 0);
        let new_stream = Stream::new(
            dictionary! {
                "Filter" => "FlateDecode",
            },
            compressed_ops,
        );
        doc.objects.insert(stream_id, Object::Stream(new_stream));

        // --- Patch page: add image XObjects to /Resources and append to /Contents ---
        // Both mutations are done inside a single get_object_mut borrow to avoid
        // borrow conflicts and to keep Resources/Contents changes atomic.
        //
        // /Resources may be inherited from an ancestor page-tree node. Overwriting
        // it with a fresh empty dict would shadow (and effectively drop) inherited
        // fonts/other resources, so resolve the effective dict first and clone it
        // onto the page before registering the mosaic XObjects.
        let effective_resources = if images_to_add.is_empty() {
            None
        } else {
            resolve_page_resources(&doc, page_id)
        };

        let xobj_additions: Vec<(Vec<u8>, Object)> = images_to_add
            .iter()
            .map(|(name, id)| (name.as_bytes().to_vec(), Object::Reference(*id)))
            .collect();

        if let Ok(page_obj) = doc.get_object_mut(page_id) {
            if let Ok(page_dict) = page_obj.as_dict_mut() {
                if !xobj_additions.is_empty() {
                    match page_dict.get_mut(b"Resources") {
                        Ok(Object::Dictionary(resources)) => {
                            // Page already has its own /Resources dict: merge the
                            // new XObject entries into it.
                            let mut xobjects = resources
                                .get(b"XObject")
                                .and_then(|x| x.as_dict())
                                .cloned()
                                .unwrap_or_default();
                            for (name_bytes, obj_ref) in xobj_additions {
                                xobjects.set(name_bytes, obj_ref);
                            }
                            resources.set("XObject", Object::Dictionary(xobjects));
                        }
                        _ => {
                            // No own /Resources dict: use the inherited one (if any)
                            // so existing fonts/resources are preserved, then attach
                            // the new image XObjects.
                            let mut resources = effective_resources.clone().unwrap_or_default();
                            let mut xobjects = resources
                                .get(b"XObject")
                                .and_then(|x| x.as_dict())
                                .cloned()
                                .unwrap_or_default();
                            for (name_bytes, obj_ref) in xobj_additions {
                                xobjects.set(name_bytes, obj_ref);
                            }
                            resources.set("XObject", Object::Dictionary(xobjects));
                            page_dict.set("Resources", Object::Dictionary(resources));
                        }
                    }
                }

                // Append new content stream to /Contents
                match page_dict.get_mut(b"Contents") {
                    Ok(Object::Reference(content_ref)) => {
                        let old_ref = *content_ref;
                        page_dict.set(
                            "Contents",
                            Object::Array(vec![
                                Object::Reference(old_ref),
                                Object::Reference(stream_id),
                            ]),
                        );
                    }
                    Ok(Object::Array(ref mut arr)) => {
                        arr.push(Object::Reference(stream_id));
                    }
                    _ => {
                        page_dict.set("Contents", Object::Reference(stream_id));
                    }
                }
            }
        }
    }

    doc.max_id = max_id;
    doc.save(output_path)
        .map_err(|e| format!("Failed to save redacted PDF to '{}': {}", output_path, e))?;

    Ok(output_path.to_string())
}
