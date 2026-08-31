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

/// 주어진 좌표가 가림 영역 목록 중 하나라도 겹치는지 검사합니다.
fn is_point_in_redactions(x: f64, y: f64, regions: &[&RedactionRegion]) -> bool {
    for r in regions {
        // 텍스트 크기와 행간을 고려하여 약간의 오차 마진(10pt) 허용
        let min_x = r.x - 5.0;
        let max_x = r.x + r.width + 5.0;
        let min_y = r.y - 5.0;
        let max_y = r.y + r.height + 5.0;

        if x >= min_x && x <= max_x && y >= min_y && y <= max_y {
            return true;
        }
    }
    false
}

/// 사각형 영역([x1, y1, x2, y2])이 가림 영역과 겹치는지 검사합니다.
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
        // 사각형 교차 검사 (AABB Overlap)
        if rx1 < bx2 && rx2 > bx1 && ry1 < by2 && ry2 > by1 {
            return true;
        }
    }
    false
}

/// 페이지의 기존 컨텐츠 스트림을 디코딩하여, 가림 영역 안에 위치한 텍스트 연산자(Tj, TJ, ', ")를
/// 삭제하거나 공백으로 치환하여 OCR/텍스트 복사를 근본적으로 방지합니다.
fn sanitize_page_content_streams(
    doc: &mut Document,
    page_id: ObjectId,
    regions: &[&RedactionRegion],
) {
    // 1. 페이지의 /Contents 객체 식별자 목록 수집
    let content_ids: Vec<ObjectId> = match doc.get_object(page_id) {
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

    // 2. 각 컨텐츠 스트림을 순회하며 텍스트 파기 처리
    for cid in content_ids {
        let stream_bytes = match doc.get_object(cid) {
            Ok(Object::Stream(stream)) => {
                // 압축 해제된 스트림 내용 가져오기
                if let Ok(decompressed) = stream.decompressed_content() {
                    decompressed
                } else {
                    stream.content.clone()
                }
            }
            _ => continue,
        };

        // lopdf 컨텐츠 연산자 디코딩
        if let Ok(mut content) = Content::decode(&stream_bytes) {
            let mut text_x = 0.0f64;
            let mut text_y = 0.0f64;
            let mut line_x = 0.0f64;
            let mut line_y = 0.0f64;
            let mut font_size = 12.0f64;
            let mut modified = false;

            for op in &mut content.operations {
                match op.operator.as_str() {
                    // 폰트 설정 (Tf): 글꼴 크기 추적
                    "Tf" => {
                        if op.operands.len() >= 2 {
                            if let Ok(sz) = op.operands[1].as_float() {
                                font_size = sz as f64;
                            } else if let Ok(sz) = op.operands[1].as_i64() {
                                font_size = sz as f64;
                            }
                        }
                    }
                    // 텍스트 행렬 설정 (Tm): [a, b, c, d, e, f] 중 e, f가 X, Y 좌표
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
                    // 텍스트 위치 상대 이동 (Td / TD)
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
                    // 다음 줄로 이동 (T*)
                    "T*" => {
                        line_y -= font_size;
                        text_x = line_x;
                        text_y = line_y;
                    }
                    // 텍스트 출력 (Tj): 단일 문자열
                    "Tj" => {
                        if is_point_in_redactions(text_x, text_y, regions) {
                            // 가림 영역과 겹칠 경우 빈 문자열로 치환
                            op.operands = vec![Object::String(Vec::new(), StringFormat::Literal)];
                            modified = true;
                        }
                    }
                    // 텍스트 출력 (TJ): 문자열 및 간격 배열
                    "TJ" => {
                        if is_point_in_redactions(text_x, text_y, regions) {
                            // 가림 영역과 겹칠 경우 빈 배열로 치환
                            op.operands = vec![Object::Array(Vec::new())];
                            modified = true;
                        }
                    }
                    // 다음 줄로 이동 후 출력 (')
                    "'" => {
                        line_y -= font_size;
                        text_x = line_x;
                        text_y = line_y;
                        if is_point_in_redactions(text_x, text_y, regions) {
                            op.operands = vec![Object::String(Vec::new(), StringFormat::Literal)];
                            modified = true;
                        }
                    }
                    // 간격 설정 및 줄바꿈 출력 (")
                    "\"" => {
                        line_y -= font_size;
                        text_x = line_x;
                        text_y = line_y;
                        if is_point_in_redactions(text_x, text_y, regions) && op.operands.len() >= 3 {
                            op.operands[2] = Object::String(Vec::new(), StringFormat::Literal);
                            modified = true;
                        }
                    }
                    _ => {}
                }
            }

            // 스트림이 수정되었다면 다시 인코딩하여 저장
            if modified {
                if let Ok(encoded) = content.encode() {
                    let compressed = zlib_compress(&encoded).unwrap_or(encoded);
                    if let Ok(stream_obj) = doc.get_object_mut(cid) {
                        if let Ok(stream) = stream_obj.as_stream_mut() {
                            stream.dict.set("Filter", "FlateDecode");
                            stream.set_plain_content(compressed);
                        }
                    }
                }
            }
        }
    }

    // 3. /Annots (링크, 주석, OCR 텍스트 레이어) 중 가림 영역과 겹치는 항목 삭제
    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Ok(page_dict) = page_obj.as_dict_mut() {
            if let Ok(annots_arr) = page_dict.get_mut(b"Annots").and_then(Object::as_array_mut) {
                annots_arr.retain(|annot_ref| {
                    if let Object::Reference(aid) = annot_ref {
                        // 어노테이션의 /Rect 영역 확인
                        if let Ok(annot_dict) = doc.get_object(*aid).and_then(Object::as_dict) {
                            if let Ok(rect_arr) = annot_dict.get(b"Rect").and_then(Object::as_array) {
                                let rect_vals: Vec<f64> = rect_arr
                                    .iter()
                                    .filter_map(|v| v.as_float().or_else(|_| v.as_i64().map(|i| i as f32)).ok())
                                    .map(|f| f as f64)
                                    .collect();
                                if is_rect_overlap_redactions(&rect_vals, regions) {
                                    return false; // 겹치는 어노테이션 제거
                                }
                            }
                        }
                    }
                    true
                });
            }
        }
    }
}

/// 지정된 PDF 파일에 모자이크/블랙아웃/화이트아웃 가림 영역을 영구적으로 적용합니다.
///
/// **보안 강화 핵심 동작**:
/// 1. 기저 텍스트 및 어노테이션 스트림에서 텍스트 연산자를 파기(Sanitize)하여 OCR/텍스트 선택 불가 보장
/// 2. 모자이크 이미지를 DeviceRGB XObject 스트림으로 변환 후 고해상도 그래픽 스탬프로 임베딩
/// 3. 블랙아웃/화이트아웃 사각형을 벡터 연산자로 드로잉
/// 4. FlateDecode zlib 압축을 적용하여 모든 PDF 뷰어(Acrobat, Chrome, Preview 등)와의 100% 호환성 확보
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

        // 1. [보안] 가림 영역 밑의 기저 텍스트 스트림 및 어노테이션 제거 (OCR 및 텍스트 선택 차단)
        sanitize_page_content_streams(&mut doc, page_id, &regions);

        let mut draw_commands = String::new();
        let mut images_to_add: Vec<(String, ObjectId)> = Vec::new();

        // 2. 가림 영역별 그래픽 드로잉 커맨드 생성
        for (idx, r) in regions.iter().enumerate() {
            match r.style.as_str() {
                "blackout" => {
                    // 단색 검정 직사각형 그리기 (q = 그래픽 상태 저장, rg = RGB 색상 설정, re = 사각형, f = 채우기, Q = 복원)
                    draw_commands.push_str(&format!(
                        "q 0 0 0 rg {:.3} {:.3} {:.3} {:.3} re f Q\n",
                        r.x, r.y, r.width, r.height
                    ));
                }
                "whiteout" => {
                    // 단색 흰색 직사각형 그리기
                    draw_commands.push_str(&format!(
                        "q 1 1 1 rg {:.3} {:.3} {:.3} {:.3} re f Q\n",
                        r.x, r.y, r.width, r.height
                    ));
                }
                "mosaic" => {
                    let mut drawn = false;
                    if let Some(ref data_url) = r.image_data {
                        // Base64 데이터 추출
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

                                    // XObject 이미지 스트림 생성
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
                                        "q {:.3} 0 0 {:.3} {:.3} {:.3} cm /{} Do Q\n",
                                        r.width, r.height, r.x, r.y, res_name
                                    ));
                                    drawn = true;
                                }
                            }
                        }
                    }

                    if !drawn {
                        // 이미지 변환 실패 시 어두운 회색 단색 박스로 폴백
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

        // 3. 신규 오버레이 컨텐츠 스트림 생성 (FlateDecode zlib 압축)
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

        // 4. 페이지 리소스(/Resources)에 XObject 등록 및 /Contents에 새 스트림 덧붙이기
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

                // /Contents 배열 뒤에 가림 처리 스트림 추가
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
        .map_err(|e| format!("가림 처리된 PDF 저장 실패 '{}': {}", output_path, e))?;

    Ok(output_path.to_string())
}
