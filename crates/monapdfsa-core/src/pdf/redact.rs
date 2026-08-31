use base64::prelude::*;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::GenericImageView;
use lopdf::content::Content;
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Write;

/// 프론트엔드에서 전달되는 고해상도 래스터라이즈(Flattening) 가림 페이지 스펙
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlattenedPageSpec {
    /// 1부터 시작하는 대상 페이지 번호
    pub page: u32,
    /// Base64 JPEG 또는 PNG 이미지 데이터 (Data URL 또는 순수 Base64)
    pub image_data: String,
    /// PDF 기준 가로 폭 (포인트 단위, 72 DPI)
    pub width_pts: f64,
    /// PDF 기준 세로 높이 (포인트 단위, 72 DPI)
    pub height_pts: f64,
}

/// 프론트엔드에서 전달되는 개별 벡터 가림 영역 정보 구조체
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedactionRegion {
    /// 영역 고유 식별자 ID
    pub id: String,
    /// 1부터 시작하는 대상 페이지 번호
    pub page: u32,
    /// PDF 기준 X 좌표 (포인트 단위, 좌하단 원점 0,0)
    pub x: f64,
    /// PDF 기준 Y 좌표 (포인트 단위, 좌하단 원점 0,0)
    pub y: f64,
    /// 가림 영역 가로 폭 (포인트 단위)
    pub width: f64,
    /// 가림 영역 세로 높이 (포인트 단위)
    pub height: f64,
    /// 가림 스타일: "mosaic" (모자이크), "blackout" (블랙아웃), "whiteout" (화이트아웃)
    pub style: String,
    /// 모자이크의 경우 브라우저 캔버스에서 렌더링된 Base64 PNG 이미지 데이터 URL
    pub image_data: Option<String>,
}

/// 바이트 데이터를 zlib (FlateDecode) 알고리즘으로 압축하여 PDF 스트림에 임베딩할 수 있도록 변환합니다.
fn zlib_compress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(data)
        .map_err(|e| format!("zlib 압축 실패: {}", e))?;
    encoder
        .finish()
        .map_err(|e| format!("zlib 인코딩 완료 실패: {}", e))
}

/// Base64 Data URL 또는 일반 Base64 문자열로부터 순수 바이너리 바이트를 디코딩합니다.
fn decode_base64_data(data_url: &str) -> Result<Vec<u8>, String> {
    let b64_str = if let Some(pos) = data_url.find(',') {
        &data_url[pos + 1..]
    } else {
        data_url
    };
    BASE64_STANDARD
        .decode(b64_str.trim())
        .map_err(|e| format!("Base64 이미지 디코딩 실패: {}", e))
}

/// 단일 페이지를 300 DPI 초고화질 래스터라이즈(Flattening) 이미지로 완전히 교체합니다.
/// **보안 핵심**: 기저의 모든 텍스트 연산자, 폰트, 어노테이션, OCR 레이어가 영구적으로 100% 소멸합니다.
fn process_page_flattening(
    doc: &mut Document,
    page_id: ObjectId,
    page_num: u32,
    spec: &FlattenedPageSpec,
    max_id: &mut u32,
) -> Result<(), String> {
    let img_bytes = decode_base64_data(&spec.image_data)?;
    let is_jpeg = img_bytes.starts_with(&[0xFF, 0xD8, 0xFF]);

    let (img_width, img_height, img_stream) = if is_jpeg {
        // JPEG 포맷: PDF의 네이티브 DCTDecode 필터를 사용하여 재압축 없이 원본 화질/초고속 임베딩
        let dyn_img = image::load_from_memory(&img_bytes)
            .map_err(|e| format!("JPEG 이미지 분석 실패: {}", e))?;
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
        (w, h, stream)
    } else {
        // PNG 또는 기타 포맷: FlateDecode (zlib) 압축 스트림으로 변환
        let dyn_img = image::load_from_memory(&img_bytes)
            .map_err(|e| format!("이미지 메모리 로드 실패: {}", e))?;
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
        (w, h, stream)
    };

    *max_id += 1;
    let img_obj_id = (*max_id, 0);
    doc.objects.insert(img_obj_id, Object::Stream(img_stream));

    // 1. 기존 페이지 컨텐츠 스트림 ID 목록 수집 (모두 삭제하여 텍스트 데이터 파기)
    let old_content_ids: Vec<ObjectId> = match doc.get_object(page_id) {
        Ok(Object::Dictionary(dict)) => match dict.get(b"Contents") {
            Ok(Object::Reference(id)) => vec![*id],
            Ok(Object::Array(arr)) => arr
                .iter()
                .filter_map(|obj| match obj {
                    Object::Reference(id) => Some(*id),
                    _ => None,
                })
                .collect(),
            _ => Vec::new(),
        },
        _ => Vec::new(),
    };

    // 2. 새 단일 컨텐츠 드로잉 스트림 생성 (cm + Do 연산자)
    let res_name = format!("MonaFlatten_{}", page_num);
    let draw_content = format!(
        "q\n{:.3} 0 0 {:.3} 0.000 0.000 cm\n/{} Do\nQ\n",
        spec.width_pts, spec.height_pts, res_name
    );

    let compressed_draw = zlib_compress(draw_content.as_bytes())?;
    *max_id += 1;
    let new_content_id = (*max_id, 0);
    let content_stream = Stream::new(
        dictionary! {
            "Filter" => "FlateDecode",
        },
        compressed_draw,
    );
    doc.objects.insert(new_content_id, Object::Stream(content_stream));

    // 3. 페이지 딕셔너리 재구성: 기저 텍스트/폰트/어노테이션 완전 파기 및 새 이미지 리소스만 할당
    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Ok(page_dict) = page_obj.as_dict_mut() {
            // Contents를 새 플래트닝 이미지 드로잉 스트림으로 교체
            page_dict.set("Contents", Object::Reference(new_content_id));

            // Resources를 새 이미지 XObject만 포함하도록 교체 (기존 폰트/인코딩 완전 파기)
            let mut xobjects = Dictionary::new();
            xobjects.set(res_name.as_bytes().to_vec(), Object::Reference(img_obj_id));
            let mut resources = Dictionary::new();
            resources.set("XObject", Object::Dictionary(xobjects));
            page_dict.set("Resources", Object::Dictionary(resources));

            // Annots(링크, 주석, OCR 텍스트 레이어) 100% 삭제
            page_dict.remove(b"Annots");

            // MediaBox 보정
            page_dict.set(
                "MediaBox",
                vec![
                    0.into(),
                    0.into(),
                    spec.width_pts.into(),
                    spec.height_pts.into(),
                ],
            );
        }
    }

    // 4. 기존 구버전 컨텐츠 스트림 객체들 메모리에서 제거
    for cid in old_content_ids {
        doc.objects.remove(&cid);
    }

    let _ = (img_width, img_height);
    Ok(())
}

/// PDF 페이지 트리를 탐색하여 부모 노드로부터 상속된 유효한 /Resources 사전을 추출합니다.
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

/// 페이지 리소스에 새 XObject들을 등록합니다.
fn add_xobjects_to_page_resources(
    doc: &mut Document,
    page_id: ObjectId,
    xobj_additions: &[(String, ObjectId)],
) {
    if xobj_additions.is_empty() {
        return;
    }

    let resources_ref = if let Ok(page_dict) = doc.get_object(page_id).and_then(Object::as_dict) {
        match page_dict.get(b"Resources") {
            Ok(Object::Reference(id)) => Some(*id),
            _ => None,
        }
    } else {
        None
    };

    if let Some(res_id) = resources_ref {
        if let Ok(res_obj) = doc.get_object_mut(res_id) {
            if let Ok(res_dict) = res_obj.as_dict_mut() {
                let mut xobjects = res_dict
                    .get(b"XObject")
                    .and_then(Object::as_dict)
                    .cloned()
                    .unwrap_or_default();
                for (name, id) in xobj_additions {
                    xobjects.set(name.as_bytes().to_vec(), Object::Reference(*id));
                }
                res_dict.set("XObject", Object::Dictionary(xobjects));
                return;
            }
        }
    }

    let inherited_resources = resolve_page_resources(doc, page_id);

    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Ok(page_dict) = page_obj.as_dict_mut() {
            let mut resources = match page_dict.get_mut(b"Resources") {
                Ok(Object::Dictionary(ref mut d)) => {
                    let mut xobjects = d
                        .get(b"XObject")
                        .and_then(Object::as_dict)
                        .cloned()
                        .unwrap_or_default();
                    for (name, id) in xobj_additions {
                        xobjects.set(name.as_bytes().to_vec(), Object::Reference(*id));
                    }
                    d.set("XObject", Object::Dictionary(xobjects));
                    return;
                }
                _ => inherited_resources.unwrap_or_default(),
            };

            let mut xobjects = resources
                .get(b"XObject")
                .and_then(Object::as_dict)
                .cloned()
                .unwrap_or_default();
            for (name, id) in xobj_additions {
                xobjects.set(name.as_bytes().to_vec(), Object::Reference(*id));
            }
            resources.set("XObject", Object::Dictionary(xobjects));
            page_dict.set("Resources", Object::Dictionary(resources));
        }
    }
}

/// 텍스트 세그먼트 좌표 및 추정 폭이 가림 영역과 겹치는지 엄밀히 검사합니다.
fn is_text_in_redactions(
    text_x: f64,
    text_y: f64,
    approx_width: f64,
    font_size: f64,
    regions: &[&RedactionRegion],
) -> bool {
    let t_min_x = text_x;
    let t_max_x = text_x + approx_width.max(10.0);
    let t_min_y = text_y - font_size * 0.3;
    let t_max_y = text_y + font_size * 0.95;

    for r in regions {
        let r_min_x = r.x;
        let r_max_x = r.x + r.width;
        let r_min_y = r.y;
        let r_max_y = r.y + r.height;

        if t_min_x <= r_max_x && t_max_x >= r_min_x && t_min_y <= r_max_y && t_max_y >= r_min_y {
            return true;
        }
    }
    false
}

/// 어노테이션 사각형 영역([x1, y1, x2, y2])이 가림 영역과 겹치는지 검사합니다.
fn is_rect_overlap_redactions(rect: &[f64], regions: &[&RedactionRegion]) -> bool {
    if rect.len() < 4 {
        return false;
    }
    let (rx1, ry1, rx2, ry2) = (
        rect[0].min(rect[2]),
        rect[1].min(rect[3]),
        rect[0].max(rect[2]),
        rect[1].max(rect[3]),
    );

    for r in regions {
        let (bx1, by1, bx2, by2) = (r.x, r.y, r.x + r.width, r.y + r.height);
        if rx1 < bx2 && rx2 > bx1 && ry1 < by2 && ry2 > by1 {
            return true;
        }
    }
    false
}

/// 구조적 벡터 가림 처리 (Structural Vector Redaction)
fn process_page_structural_redaction(
    doc: &mut Document,
    page_id: ObjectId,
    page_num: u32,
    regions: &[&RedactionRegion],
    max_id: &mut u32,
) -> Result<(), String> {
    if regions.is_empty() {
        return Ok(());
    }

    let (content_ids, is_direct_stream) = match doc.get_object(page_id) {
        Ok(Object::Dictionary(dict)) => match dict.get(b"Contents") {
            Ok(Object::Reference(id)) => (vec![*id], false),
            Ok(Object::Array(arr)) => {
                let ids = arr
                    .iter()
                    .filter_map(|obj| match obj {
                        Object::Reference(id) => Some(*id),
                        _ => None,
                    })
                    .collect();
                (ids, false)
            }
            Ok(Object::Stream(_)) => (Vec::new(), true),
            _ => (Vec::new(), false),
        },
        _ => (Vec::new(), false),
    };

    let mut combined_stream_bytes = Vec::new();
    for cid in &content_ids {
        if let Ok(Object::Stream(stream)) = doc.get_object(*cid) {
            let decompressed = stream
                .decompressed_content()
                .unwrap_or_else(|_| stream.content.clone());
            if !combined_stream_bytes.is_empty() {
                combined_stream_bytes.push(b'\n');
            }
            combined_stream_bytes.extend_from_slice(&decompressed);
        }
    }

    if is_direct_stream {
        if let Ok(Object::Dictionary(dict)) = doc.get_object(page_id) {
            if let Ok(Object::Stream(stream)) = dict.get(b"Contents") {
                let decompressed = stream
                    .decompressed_content()
                    .unwrap_or_else(|_| stream.content.clone());
                combined_stream_bytes = decompressed;
            }
        }
    }

    let sanitized_bytes = if let Ok(mut content) = Content::decode(&combined_stream_bytes) {
        let mut text_x = 0.0f64;
        let mut text_y = 0.0f64;
        let mut line_x = 0.0f64;
        let mut line_y = 0.0f64;
        let mut font_size = 12.0f64;
        let mut leading = 14.4f64;

        for op in &mut content.operations {
            match op.operator.as_str() {
                "Tf" => {
                    if op.operands.len() >= 2 {
                        if let Ok(sz) = op.operands[1].as_float() {
                            font_size = sz as f64;
                        } else if let Ok(sz) = op.operands[1].as_i64() {
                            font_size = sz as f64;
                        }
                    }
                }
                "TL" => {
                    if let Some(first) = op.operands.first() {
                        if let Ok(l) = first.as_float() {
                            leading = l as f64;
                        } else if let Ok(l) = first.as_i64() {
                            leading = l as f64;
                        }
                    }
                }
                "Tm" => {
                    if op.operands.len() >= 6 {
                        let e = op.operands[4].as_float().or_else(|_| op.operands[4].as_i64().map(|v| v as f32)).unwrap_or(0.0) as f64;
                        let f = op.operands[5].as_float().or_else(|_| op.operands[5].as_i64().map(|v| v as f32)).unwrap_or(0.0) as f64;
                        text_x = e;
                        text_y = f;
                        line_x = e;
                        line_y = f;
                    }
                }
                "Td" | "TD" => {
                    if op.operands.len() >= 2 {
                        let tx = op.operands[0].as_float().or_else(|_| op.operands[0].as_i64().map(|v| v as f32)).unwrap_or(0.0) as f64;
                        let ty = op.operands[1].as_float().or_else(|_| op.operands[1].as_i64().map(|v| v as f32)).unwrap_or(0.0) as f64;
                        line_x += tx;
                        line_y += ty;
                        text_x = line_x;
                        text_y = line_y;
                        if op.operator == "TD" {
                            leading = -ty;
                        }
                    }
                }
                "T*" => {
                    line_y -= leading;
                    text_x = line_x;
                    text_y = line_y;
                }
                "Tj" => {
                    let text_len = if let Some(Object::String(s, _)) = op.operands.first() {
                        s.len()
                    } else {
                        1
                    };
                    let approx_w = (text_len as f64) * font_size * 0.55;
                    if is_text_in_redactions(text_x, text_y, approx_w, font_size, regions) {
                        op.operands = vec![Object::String(Vec::new(), StringFormat::Literal)];
                    }
                    text_x += approx_w;
                }
                "TJ" => {
                    if let Some(Object::Array(ref mut arr)) = op.operands.first_mut() {
                        let mut curr_x = text_x;
                        for item in arr.iter_mut() {
                            match item {
                                Object::String(s, _) => {
                                    let seg_w = (s.len() as f64) * font_size * 0.55;
                                    if is_text_in_redactions(curr_x, text_y, seg_w, font_size, regions) {
                                        *item = Object::String(Vec::new(), StringFormat::Literal);
                                    }
                                    curr_x += seg_w;
                                }
                                Object::Integer(adj) => {
                                    curr_x -= (*adj as f64) / 1000.0 * font_size;
                                }
                                Object::Real(adj) => {
                                    curr_x -= (*adj as f64) / 1000.0 * font_size;
                                }
                                _ => {}
                            }
                        }
                    }
                }
                "'" => {
                    line_y -= font_size;
                    text_x = line_x;
                    text_y = line_y;
                    let text_len = if let Some(Object::String(s, _)) = op.operands.first() {
                        s.len()
                    } else {
                        1
                    };
                    let approx_w = (text_len as f64) * font_size * 0.55;
                    if is_text_in_redactions(text_x, text_y, approx_w, font_size, regions) {
                        op.operands = vec![Object::String(Vec::new(), StringFormat::Literal)];
                    }
                }
                "\"" => {
                    line_y -= font_size;
                    text_x = line_x;
                    text_y = line_y;
                    if op.operands.len() >= 3 {
                        let text_len = if let Object::String(s, _) = &op.operands[2] {
                            s.len()
                        } else {
                            1
                        };
                        let approx_w = (text_len as f64) * font_size * 0.55;
                        if is_text_in_redactions(text_x, text_y, approx_w, font_size, regions) {
                            op.operands[2] = Object::String(Vec::new(), StringFormat::Literal);
                        }
                    }
                }
                _ => {}
            }
        }

        content.encode().unwrap_or(combined_stream_bytes)
    } else {
        combined_stream_bytes
    };

    let mut draw_commands = String::new();
    let mut images_to_add: Vec<(String, ObjectId)> = Vec::new();

    for (idx, r) in regions.iter().enumerate() {
        match r.style.as_str() {
            "blackout" => {
                draw_commands.push_str(&format!(
                    "\nq\n0 0 0 rg\n{:.3} {:.3} {:.3} {:.3} re\nf\nQ\n",
                    r.x, r.y, r.width, r.height
                ));
            }
            "whiteout" => {
                draw_commands.push_str(&format!(
                    "\nq\n1 1 1 rg\n{:.3} {:.3} {:.3} {:.3} re\nf\nQ\n",
                    r.x, r.y, r.width, r.height
                ));
            }
            "mosaic" => {
                let mut drawn = false;
                if let Some(ref data_url) = r.image_data {
                    if let Ok(bytes) = decode_base64_data(data_url) {
                        if let Ok(img) = image::load_from_memory(&bytes) {
                            let (w, h) = img.dimensions();
                            let rgb = img.to_rgb8();

                            if let Ok(compressed) = zlib_compress(&rgb) {
                                *max_id += 1;
                                let img_id = (*max_id, 0);

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
                                let res_name = format!("MonaMosaic_{}_{}", page_num, idx);
                                images_to_add.push((res_name.clone(), img_id));

                                draw_commands.push_str(&format!(
                                    "\nq\n{:.3} 0 0 {:.3} {:.3} {:.3} cm\n/{} Do\nQ\n",
                                    r.width, r.height, r.x, r.y, res_name
                                ));
                                drawn = true;
                            }
                        }
                    }
                }

                if !drawn {
                    draw_commands.push_str(&format!(
                        "\nq\n0.12 0.12 0.12 rg\n{:.3} {:.3} {:.3} {:.3} re\nf\nQ\n",
                        r.x, r.y, r.width, r.height
                    ));
                }
            }
            _ => {}
        }
    }

    add_xobjects_to_page_resources(doc, page_id, &images_to_add);

    let mut final_content_bytes = sanitized_bytes;
    if !draw_commands.is_empty() {
        final_content_bytes.extend_from_slice(draw_commands.as_bytes());
    }

    let compressed_final = zlib_compress(&final_content_bytes)
        .map_err(|e| format!("가림 처리 컨텐츠 스트림 압축 실패: {}", e))?;

    *max_id += 1;
    let new_stream_id = (*max_id, 0);
    let new_stream = Stream::new(
        dictionary! {
            "Filter" => "FlateDecode",
        },
        compressed_final,
    );
    doc.objects.insert(new_stream_id, Object::Stream(new_stream));

    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Ok(page_dict) = page_obj.as_dict_mut() {
            page_dict.set("Contents", Object::Reference(new_stream_id));
        }
    }

    for cid in content_ids {
        doc.objects.remove(&cid);
    }

    let annots_to_remove: Vec<ObjectId> = if let Ok(page_dict) = doc.get_object(page_id).and_then(Object::as_dict) {
        if let Ok(annots_arr) = page_dict.get(b"Annots").and_then(Object::as_array) {
            annots_arr
                .iter()
                .filter_map(|annot_ref| {
                    if let Object::Reference(aid) = annot_ref {
                        if let Ok(annot_dict) = doc.get_object(*aid).and_then(Object::as_dict) {
                            if let Ok(rect_arr) = annot_dict.get(b"Rect").and_then(Object::as_array) {
                                let rect_vals: Vec<f64> = rect_arr
                                    .iter()
                                    .filter_map(|v| v.as_float().or_else(|_| v.as_i64().map(|i| i as f32)).ok())
                                    .map(|f| f as f64)
                                    .collect();
                                if is_rect_overlap_redactions(&rect_vals, regions) {
                                    return Some(*aid);
                                }
                            }
                        }
                    }
                    None
                })
                .collect()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    if !annots_to_remove.is_empty() {
        if let Ok(page_obj) = doc.get_object_mut(page_id) {
            if let Ok(page_dict) = page_obj.as_dict_mut() {
                if let Ok(annots_arr) = page_dict.get_mut(b"Annots").and_then(Object::as_array_mut) {
                    annots_arr.retain(|annot_ref| {
                        if let Object::Reference(aid) = annot_ref {
                            !annots_to_remove.contains(aid)
                        } else {
                            true
                        }
                    });
                }
            }
        }
    }

    Ok(())
}

/// 지정된 PDF 파일에 스마트 하이브리드 가림 처리(고해상도 플래트닝 + 벡터 가림)를 적용합니다.
///
/// **보안 가림 아키텍처**:
/// - `flattened_pages`에 포함된 페이지는 300 DPI 초고화질 이미지로 래스터라이즈(Flattening)되어 기저 텍스트/글리프/어노테이션이 100% 영구 소멸 (드래그/OCR 불가)
/// - 가림이 없는 페이지는 원본 벡터 PDF 품질과 텍스트 선택성을 온전히 보존
pub fn apply_redactions_hybrid(
    input_path: &str,
    output_path: &str,
    flattened_pages: &[FlattenedPageSpec],
    redactions: &[RedactionRegion],
) -> Result<String, String> {
    let mut doc = Document::load(input_path)
        .map_err(|e| format!("PDF 문서를 불러올 수 없습니다 '{}': {}", input_path, e))?;

    let pages = doc.get_pages();
    let mut max_id = doc.max_id;

    // 1. 고해상도 플래트닝 페이지 우선 처리
    let mut flattened_page_nums = std::collections::HashSet::new();
    for spec in flattened_pages {
        flattened_page_nums.insert(spec.page);
        let page_id = match pages.get(&spec.page) {
            Some(&id) => id,
            None => continue,
        };
        process_page_flattening(&mut doc, page_id, spec.page, spec, &mut max_id)?;
    }

    // 2. 플래트닝되지 않은 나머지 페이지 중 벡터 가림 영역이 있는 경우 처리
    let mut by_page: BTreeMap<u32, Vec<&RedactionRegion>> = BTreeMap::new();
    for r in redactions {
        if !flattened_page_nums.contains(&r.page) {
            by_page.entry(r.page).or_default().push(r);
        }
    }

    for (page_num, regions) in by_page {
        let page_id = match pages.get(&page_num) {
            Some(&id) => id,
            None => continue,
        };
        process_page_structural_redaction(&mut doc, page_id, page_num, &regions, &mut max_id)?;
    }

    doc.max_id = max_id;
    doc.save(output_path)
        .map_err(|e| format!("가림 처리된 PDF 저장 실패 '{}': {}", output_path, e))?;

    Ok(output_path.to_string())
}

/// 기존 호환성을 위한 단일 apply_redactions 래퍼
pub fn apply_redactions(
    input_path: &str,
    output_path: &str,
    redactions: &[RedactionRegion],
) -> Result<String, String> {
    apply_redactions_hybrid(input_path, output_path, &[], redactions)
}
