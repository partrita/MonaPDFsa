use std::io::Read;

use flate2::read::ZlibDecoder;
use image::codecs::jpeg::JpegEncoder;
use image::{ImageBuffer, RgbImage};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream};

/// 0-100 압축 레벨 → 최대 해상도 및 JPEG 품질 매핑
/// 0: 최소 압축 (무손실 위주)
/// 100: 최대 압축 (초경량 크기 목표)
fn level_params(level: u8) -> (Option<u32>, u8) {
    let level = level.min(100);
    if level == 0 {
        return (None, 90);
    }

    // 압축 레벨이 올라갈수록 해상도를 하향 제한
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

    // 압축 레벨(1~100)이 높아질수록 JPEG 품질(85 -> 25)을 낮추어 용량을 획기적으로 줄임
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
}

#[derive(Debug, Clone)]
struct ImageInfo {
    id: ObjectId,
    width: i64,
    height: i64,
    color_space: Option<String>,
    filters: Option<Vec<String>>,
    content: Vec<u8>,
}

/// PDF 이미지 콘텐츠를 디코딩하여 RGB 픽셀 버퍼로 변환
fn decode_to_rgb(img: &ImageInfo) -> Result<RgbImage, String> {
    let filters = img.filters.clone().unwrap_or_default();
    let raw: Vec<u8> = if filters.iter().any(|f| f == "DCTDecode" || f == "DCT") {
        img.content.clone()
    } else if filters.iter().any(|f| f == "FlateDecode" || f == "Fl") {
        let mut d = ZlibDecoder::new(std::io::Cursor::new(&img.content));
        let mut out = Vec::new();
        d.read_to_end(&mut out).map_err(|e| format!("zlib 해제 실패: {}", e))?;
        out
    } else {
        img.content.clone()
    };

    // 1) 이미 JPEG 인코딩된 스트림이면 image 라이브러리로 직접 로드
    if filters.iter().any(|f| f == "DCTDecode" || f == "DCT") {
        let dyn_img = image::load_from_memory(&raw)
            .map_err(|e| format!("JPEG 디코딩 실패: {}", e))?;
        return Ok(dyn_img.to_rgb8());
    }

    // 2) 일반 이미지 버퍼 직접 파싱 (RGB, Grayscale, CMYK)
    let w = img.width.max(1) as u32;
    let h = img.height.max(1) as u32;
    let total_pixels = (w as usize) * (h as usize);

    let is_gray = img.color_space.as_deref() == Some("DeviceGray");
    let is_cmyk = img.color_space.as_deref() == Some("DeviceCMYK");

    if is_gray {
        if raw.len() < total_pixels {
            return Err(format!("그레이스케일 버퍼 부족: {} < {}", raw.len(), total_pixels));
        }
        let mut buf = Vec::with_capacity(total_pixels * 3);
        for &g in raw.iter().take(total_pixels) {
            buf.extend_from_slice(&[g, g, g]);
        }
        ImageBuffer::from_raw(w, h, buf).ok_or_else(|| "그레이 버퍼 생성 실패".to_string())
    } else if is_cmyk {
        let need_cmyk = total_pixels * 4;
        if raw.len() < need_cmyk {
            return Err(format!("CMYK 버퍼 부족: {} < {}", raw.len(), need_cmyk));
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
        ImageBuffer::from_raw(w, h, buf).ok_or_else(|| "CMYK 버퍼 생성 실패".to_string())
    } else {
        // 기본 RGB (또는 추정 RGB)
        let need_rgb = total_pixels * 3;
        if raw.len() >= need_rgb {
            let buf = raw[..need_rgb].to_vec();
            ImageBuffer::from_raw(w, h, buf).ok_or_else(|| "RGB 버퍼 생성 실패".to_string())
        } else {
            // raw 포맷 시도
            image::load_from_memory(&raw)
                .map(|img| img.to_rgb8())
                .map_err(|e| format!("이미지 파싱 실패: {}", e))
        }
    }
}

/// PDF 이미지를 지정 품질의 JPEG로 재인코딩
fn encode_jpeg(rgb: &RgbImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut enc = JpegEncoder::new_with_quality(&mut out, quality);
    enc.encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("JPEG 인코딩 실패: {}", e))?;
    Ok(out)
}

/// 단일 PDF 파일을 지정된 레벨로 압축하여 output_path에 저장
pub fn compress_pdf(input_path: &str, opts: &CompressionOptions) -> Result<CompressionResult, String> {
    let original_bytes = std::fs::read(input_path)
        .map_err(|e| format!("원본 PDF 읽기 실패 '{}': {}", input_path, e))?;
    let original_size = original_bytes.len() as u64;

    let mut doc = Document::load_mem(&original_bytes)
        .map_err(|e| format!("PDF 로드 실패: {}", e))?;

    let pages = doc.get_pages().len();
    let (max_dim, jpeg_q) = level_params(opts.level);

    // 문서 내의 모든 Image XObject 탐색 (페이지 직접 참조 및 전역 XObject 포함)
    let mut seen_ids = std::collections::HashSet::new();
    let mut images: Vec<ImageInfo> = Vec::new();

    for (&id, obj) in &doc.objects {
        if let Object::Stream(ref stream) = obj {
            let is_image = stream.dict.get(b"Subtype")
                .ok()
                .and_then(|o| o.as_name().ok())
                .map(|name| name == b"Image")
                .unwrap_or(false);

            if is_image && seen_ids.insert(id) {
                let width = stream.dict.get(b"Width")
                    .ok()
                    .and_then(|o| match o {
                        Object::Integer(i) => Some(*i),
                        _ => None,
                    })
                    .unwrap_or(0);

                let height = stream.dict.get(b"Height")
                    .ok()
                    .and_then(|o| match o {
                        Object::Integer(i) => Some(*i),
                        _ => None,
                    })
                    .unwrap_or(0);

                let color_space = stream.dict.get(b"ColorSpace")
                    .ok()
                    .and_then(|o| match o {
                        Object::Name(name) => String::from_utf8(name.clone()).ok(),
                        _ => None,
                    });

                let filters = stream.filters().ok().map(|vec| {
                    vec.into_iter()
                        .filter_map(|bytes| String::from_utf8(bytes.to_vec()).ok())
                        .collect()
                });

                images.push(ImageInfo {
                    id,
                    width,
                    height,
                    color_space,
                    filters,
                    content: stream.content.clone(),
                });
            }
        }
    }

    let mut image_count = 0usize;

    // 레벨에 따른 이미지 다운샘플링 및 JPEG 재인코딩
    if opts.level > 0 {
        for img in &images {
            let rgb = match decode_to_rgb(img) {
                Ok(r) => r,
                Err(_) => continue,
            };

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
                rgb
            } else {
                image::imageops::resize(&rgb, tw, th, image::imageops::FilterType::Triangle)
            };

            let jpeg = match encode_jpeg(&resized, jpeg_q) {
                Ok(j) => j,
                Err(_) => continue,
            };

            // 재인코딩 결과가 더 작거나 해상도가 감소한 경우 교체
            if jpeg.len() < img.content.len() || tw < w || th < h {
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

    // 미참조 고아 객체 정리 및 스트림 압축
    doc.prune_objects();
    doc.compress();

    doc.save(&opts.output_path)
        .map_err(|e| format!("압축된 PDF 저장 실패: {}", e))?;

    let compressed_size = std::fs::read(&opts.output_path)
        .map_err(|e| format!("출력 파일 읽기 실패: {}", e))?
        .len() as u64;

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
    })
}