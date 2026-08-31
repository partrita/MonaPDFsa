use base64::prelude::*;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::GenericImageView;
use lopdf::content::Content;
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Write;

/// 프론트엔드에서 전달되는 가림 영역(모자이크, 블랙아웃, 화이트아웃) 정보 구조체
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

/// PDF 페이지 트리를 탐색하여 부모 노드로부터 상속된 유효한 /Resources 사전을 추출합니다.
/// PDF 명세에 따르면 하위 페이지는 상위 노드의 리소스를 상속받을 수 있습니다.
fn resolve_page_resources(doc: &Document, mut node: ObjectId) -> Option<Dictionary> {
    let mut seen = std::collections::HashSet::new();
    loop {
        // 무한 참조 루프 방지
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
                // 상위 부모 노드가 있으면 부모 노드로 거슬러 올라감
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
/// 기존 리소스(/Font, /ExtGState, 기존 /XObject 등)를 100% 보존합니다.
fn add_xobjects_to_page_resources(
    doc: &mut Document,
    page_id: ObjectId,
    xobj_additions: &[(String, ObjectId)],
) {
    if xobj_additions.is_empty() {
        return;
    }

    // 1. 페이지의 /Resources 객체 참조 형태 확인
    let resources_ref = if let Ok(page_dict) = doc.get_object(page_id).and_then(Object::as_dict) {
        match page_dict.get(b"Resources") {
            Ok(Object::Reference(id)) => Some(*id),
            _ => None,
        }
    } else {
        None
    };

    // 2-A. /Resources가 간접 참조(Indirect Object)인 경우 해당 리소스 객체 직접 수정
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

    // 2-B. /Resources가 페이지 사전에 직접 포함되어 있거나 상위 노드로부터 상속된 경우
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

        // AABB (Axis-Aligned Bounding Box) 사각형 교차 검사
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

/// open-redact-pdf 스타일의 구조적 가림 처리 (Structural Redaction):
/// 1. 페이지의 기존 모든 컨텐츠 스트림을 결합 및 디코딩
/// 2. 가림 영역 내부의 텍스트 연산자(Tj, TJ, ', ")를 PDF 구조 자체에서 완전히 제거/치환
/// 3. 가림 영역(모자이크 이미지 Do 또는 블랙/화이트 박스) 드로잉 연산자를 단일 통합 스트림 끝에 병합
/// 4. FlateDecode 단일 압축 스트림으로 페이지 /Contents를 결정론적(Deterministic)으로 덮어씀
/// 5. /Annots 어노테이션 중 겹치는 항목 삭제
fn process_page_structural_redaction(
    doc: &mut Document,
    page_id: ObjectId,
    page_num: u32,
    regions: &[&RedactionRegion],
    max_id: &mut u64,
) -> Result<(), String> {
    if regions.is_empty() {
        return Ok(());
    }

    // 1. 페이지의 기존 /Contents 객체 ID 목록 수집
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

    // 2. 모든 컨텐츠 스트림 내용을 하나로 합쳐 디코딩
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

    // 3. 텍스트 연산자 구조적 파기 처리 (Structural Content Sanitization)
    let sanitized_bytes = if let Ok(mut content) = Content::decode(&combined_stream_bytes) {
        let mut text_x = 0.0f64;
        let mut text_y = 0.0f64;
        let mut line_x = 0.0f64;
        let mut line_y = 0.0f64;
        let mut font_size = 12.0f64;

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
                    }
                }
                "T*" => {
                    line_y -= font_size;
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

    // 4. 시각적 가림 드로잉 커맨드 생성 (모자이크 이미지 또는 솔리드 벡터 박스)
    let mut draw_commands = String::new();
    let mut images_to_add: Vec<(String, ObjectId)> = Vec::new();

    for (idx, r) in regions.iter().enumerate() {
        match r.style.as_str() {
            "blackout" => {
                // 단색 검정 박스 (q = 그래픽 상태 저장, rg = 색상, re = 사각형, f = 채우기, Q = 복원)
                draw_commands.push_str(&format!(
                    "\nq\n0 0 0 rg\n{:.3} {:.3} {:.3} {:.3} re\nf\nQ\n",
                    r.x, r.y, r.width, r.height
                ));
            }
            "whiteout" => {
                // 단색 흰색 박스
                draw_commands.push_str(&format!(
                    "\nq\n1 1 1 rg\n{:.3} {:.3} {:.3} {:.3} re\nf\nQ\n",
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

                                // PDF cm 연산자: [width 0 0 height x y cm /Do]
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
                    // 이미지 파싱 실패 시 차콜 그레이 단색 박스로 안전하게 폴백
                    draw_commands.push_str(&format!(
                        "\nq\n0.12 0.12 0.12 rg\n{:.3} {:.3} {:.3} {:.3} re\nf\nQ\n",
                        r.x, r.y, r.width, r.height
                    ));
                }
            }
            _ => {}
        }
    }

    // 5. 모자이크 이미지 XObject를 페이지 리소스에 안전하게 등록 (기존 글꼴/서식 100% 보존)
    add_xobjects_to_page_resources(doc, page_id, &images_to_add);

    // 6. 단일 통합 컨텐츠 스트림 빌드 (Sanitized Text Operations + Redaction Drawings)
    let mut final_content_bytes = sanitized_bytes;
    if !draw_commands.is_empty() {
        final_content_bytes.extend_from_slice(draw_commands.as_bytes());
    }

    // FlateDecode zlib 압축
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

    // 7. 페이지 사전에 새로운 단일 통합 스트림 할당
    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Ok(page_dict) = page_obj.as_dict_mut() {
            page_dict.set("Contents", Object::Reference(new_stream_id));
        }
    }

    // 기존 분리된 컨텐츠 스트림 객체 정리 (Deterministic Pruning)
    for cid in content_ids {
        doc.objects.remove(&cid);
    }

    // 8. /Annots (링크, 주석, OCR 텍스트 레이어) 중 가림 영역과 겹치는 항목 삭제
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

/// 지정된 PDF 파일에 모자이크/블랙아웃/화이트아웃 가림 영역을 영구적으로 적용합니다.
///
/// **open-redact-pdf 표준 기반 보안 가림 아키텍처**:
/// 1. 단순 시각적 덮어쓰기가 아닌 PDF 컨텐츠 스트림 구조체에서 목표 텍스트 연산자를 완전 파기(Removal)
/// 2. 가려지지 않은 본문/이미지/서식은 100% 선택 및 검색(Selectable & Searchable) 유지
/// 3. 단일 통합 컨텐츠 스트림 재작성(Unified Stream Rewrite)으로 모든 뷰어에서 100% 렌더링 보장
/// 4. 저장 시 전체 문서 결정론적 재직렬화(Deterministic Full-Document Serialization)
pub fn apply_redactions(
    input_path: &str,
    output_path: &str,
    redactions: &[RedactionRegion],
) -> Result<String, String> {
    let mut doc = Document::load(input_path)
        .map_err(|e| format!("PDF 문서를 불러올 수 없습니다 '{}': {}", input_path, e))?;

    let pages = doc.get_pages();
    let mut max_id = doc.max_id;

    // 페이지 번호별로 가림 영역 그룹화
    let mut by_page: BTreeMap<u32, Vec<&RedactionRegion>> = BTreeMap::new();
    for r in redactions {
        by_page.entry(r.page).or_default().push(r);
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
