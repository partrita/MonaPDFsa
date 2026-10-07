use base64::prelude::*;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::GenericImageView;
use lopdf::{dictionary, Document, Object, Stream};
use std::fs;
use std::io::Write;
use std::path::Path;

/// Compresses slice using zlib / FlateDecode.
fn zlib_compress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(data)
        .map_err(|e| format!("zlib 압축 실패: {}", e))?;
    encoder
        .finish()
        .map_err(|e| format!("zlib 인코딩 완료 실패: {}", e))
}

/// Creates a standard A4 (595 x 842 pt) PDF Document from an image file (JPG, PNG, WebP, etc.).
/// The image is letterboxed/scaled to fit within A4 margins while maintaining aspect ratio.
pub fn image_to_pdf_document(image_path: &str) -> Result<Document, String> {
    let path = Path::new(image_path);
    if !path.exists() {
        return Err(format!("이미지 파일이 존재하지 않습니다: {}", image_path));
    }

    let img_bytes = fs::read(image_path)
        .map_err(|e| format!("이미지 파일 읽기 실패 '{}': {}", image_path, e))?;

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let is_jpeg = ext == "jpg" || ext == "jpeg";

    let (img_w, img_h, img_stream) = if is_jpeg {
        let dyn_img = image::load_from_memory(&img_bytes)
            .map_err(|e| format!("JPEG 이미지 디코딩 실패: {}", e))?;
        let (w, h) = dyn_img.dimensions();

        let stream = Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => w as i64,
                "Height" => h as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8,
                "Filter" => "DCTDecode",
            },
            img_bytes,
        );
        (w as f64, h as f64, stream)
    } else {
        let dyn_img = image::load_from_memory(&img_bytes)
            .map_err(|e| format!("이미지 디코딩 실패: {}", e))?;
        let (w, h) = dyn_img.dimensions();
        let rgb_raw = dyn_img.to_rgb8();
        let compressed = zlib_compress(&rgb_raw)?;

        let stream = Stream::new(
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
        (w as f64, h as f64, stream)
    };

    // Standard A4 dimensions in PDF points (72 DPI)
    let page_w = 595.0;
    let page_h = 842.0;

    // Calculate fitted dimensions preserving aspect ratio with margin
    let margin = 20.0;
    let avail_w = page_w - (margin * 2.0);
    let avail_h = page_h - (margin * 2.0);

    let scale_x = avail_w / img_w;
    let scale_y = avail_h / img_h;
    let fit_scale = scale_x.min(scale_y);

    let draw_w = img_w * fit_scale;
    let draw_h = img_h * fit_scale;

    // Center on the page
    let draw_x = (page_w - draw_w) / 2.0;
    let draw_y = (page_h - draw_h) / 2.0;

    let res_name = "Im0";
    let draw_content = format!(
        "q\n{:.3} 0 0 {:.3} {:.3} {:.3} cm\n/{} Do\nQ\n",
        draw_w, draw_h, draw_x, draw_y, res_name
    );
    let compressed_draw = zlib_compress(draw_content.as_bytes())?;

    let mut doc = Document::with_version("1.5");
    let image_id = doc.new_object_id();
    doc.objects.insert(image_id, Object::Stream(img_stream));

    let content_id = doc.new_object_id();
    let content_stream = Stream::new(
        dictionary! {
            "Filter" => "FlateDecode",
        },
        compressed_draw,
    );
    doc.objects.insert(content_id, Object::Stream(content_stream));

    let page_id = doc.new_object_id();
    let pages_id = doc.new_object_id();

    let page_dict = dictionary! {
        "Type" => "Page",
        "Parent" => Object::Reference(pages_id),
        "MediaBox" => vec![0.into(), 0.into(), page_w.into(), page_h.into()],
        "Contents" => Object::Reference(content_id),
        "Resources" => dictionary! {
            "XObject" => dictionary! {
                res_name => Object::Reference(image_id),
            },
        },
    };
    doc.objects.insert(page_id, Object::Dictionary(page_dict));

    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Count" => 1,
        "Kids" => vec![Object::Reference(page_id)],
    };
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let catalog_id = doc.new_object_id();
    let catalog_dict = dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    };
    doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    Ok(doc)
}

/// Converts an image file to a single-page PDF, returning the raw PDF bytes.
pub fn image_to_pdf_bytes(image_path: &str) -> Result<Vec<u8>, String> {
    let mut doc = image_to_pdf_document(image_path)?;
    let mut buffer = Vec::new();
    doc.save_to(&mut buffer)
        .map_err(|e| format!("PDF 직렬화 실패: {}", e))?;
    Ok(buffer)
}

/// Converts an image file to a single-page PDF and returns base64 encoded data.
pub fn image_to_pdf_base64(image_path: &str) -> Result<String, String> {
    let bytes = image_to_pdf_bytes(image_path)?;
    Ok(BASE64_STANDARD.encode(&bytes))
}
