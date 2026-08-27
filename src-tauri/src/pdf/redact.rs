use base64::prelude::*;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::GenericImageView;
use lopdf::{dictionary, Document, Object, ObjectId, Stream};
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
        let mut images_to_add: Vec<(String, ObjectId)> = Vec::new();

        for (idx, r) in regions.iter().enumerate() {
            match r.style.as_str() {
                "blackout" => {
                    // Solid black rectangle
                    draw_commands.push_str(&format!(
                        " q 0 0 0 rg {:.3} {:.3} {:.3} {:.3} re f Q\n",
                        r.x, r.y, r.width, r.height
                    ));
                }
                "whiteout" => {
                    // Solid white rectangle
                    draw_commands.push_str(&format!(
                        " q 1 1 1 rg {:.3} {:.3} {:.3} {:.3} re f Q\n",
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

                                let mut encoder =
                                    ZlibEncoder::new(Vec::new(), Compression::default());
                                if encoder.write_all(&rgb).is_ok() {
                                    if let Ok(compressed) = encoder.finish() {
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

                                        draw_commands.push_str(&format!(
                                            " q {:.3} 0 0 {:.3} {:.3} {:.3} cm /{} Do Q\n",
                                            r.width, r.height, r.x, r.y, res_name
                                        ));
                                        drawn = true;
                                    }
                                }
                            }
                        }
                    }

                    if !drawn {
                        // Fallback to dark gray fill if image data could not be parsed
                        draw_commands.push_str(&format!(
                            " q 0.1 0.1 0.1 rg {:.3} {:.3} {:.3} {:.3} re f Q\n",
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

        // Register images in page's /Resources /XObject
        if !images_to_add.is_empty() {
            if let Ok(page_dict) = doc.get_object_mut(page_id).and_then(|o| o.as_dict_mut()) {
                if !page_dict.has(b"Resources") {
                    page_dict.set("Resources", dictionary! {});
                }
                if let Ok(resources) = page_dict.get_mut(b"Resources").and_then(|r| r.as_dict_mut()) {
                    if !resources.has(b"XObject") {
                        resources.set("XObject", dictionary! {});
                    }
                    if let Ok(xobjects) = resources.get_mut(b"XObject").and_then(|x| x.as_dict_mut()) {
                        for (name, img_id) in images_to_add {
                            xobjects.set(name, Object::Reference(img_id));
                        }
                    }
                }
            }
        }

        // Create new content stream and append to page
        max_id += 1;
        let stream_id = (max_id, 0);
        let new_stream = Stream::new(dictionary! {}, draw_commands.into_bytes());
        doc.objects.insert(stream_id, Object::Stream(new_stream));

        if let Ok(page_dict) = doc.get_object_mut(page_id).and_then(|o| o.as_dict_mut()) {
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

    doc.max_id = max_id;
    doc.save(output_path)
        .map_err(|e| format!("Failed to save redacted PDF to '{}': {}", output_path, e))?;

    Ok(output_path.to_string())
}
