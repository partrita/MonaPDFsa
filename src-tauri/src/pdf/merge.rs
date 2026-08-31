use lopdf::{dictionary, Document, Object};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

/// 통합 페이지 관리에서 각 페이지의 원본 위치 및 회전 각도를 나타내는 명세 구조체
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageOrganizeSpec {
    /// 원본 PDF 파일 경로
    pub source_path: String,
    /// 1부터 시작하는 원본 페이지 번호
    pub page_number: u32,
    /// 추가 적용할 회전 각도 (0, 90, 180, 270)
    pub rotation: i32,
}

/// 여러 PDF 파일을 지정된 순서대로 하나의 PDF 문서로 병합합니다.
///
/// **동작 원리**:
/// 1. 각 입력 PDF 문서를 로드하고, 객체 ID 충돌을 방지하기 위해 `renumber_objects_with`로 객체 식별자를 재할당합니다.
/// 2. 모든 문서의 페이지 객체 참조(`/Pages` Kids)를 새로운 통합 타겟 문서로 수집합니다.
/// 3. 새로운 루트 `/Pages` 및 `/Catalog` 객체를 생성하여 연결하고, 불필요한 고아 객체를 정리(`prune_objects`)한 뒤 저장합니다.
pub fn merge_pdfs(input_paths: &[String], output_path: &str) -> Result<String, String> {
    if input_paths.is_empty() {
        return Err("병합할 PDF 파일이 지정되지 않았습니다.".to_string());
    }

    if input_paths.len() == 1 {
        fs::copy(&input_paths[0], output_path)
            .map_err(|e| format!("단일 파일 복사 실패: {}", e))?;
        return Ok(output_path.to_string());
    }

    let mut documents: Vec<Document> = Vec::new();
    for path in input_paths {
        let doc = Document::load(path)
            .map_err(|e| format!("PDF 파일 '{}' 로드 실패: {}", path, e))?;
        documents.push(doc);
    }

    let mut max_id = 1;
    let mut target_doc = Document::with_version("1.5");
    let mut target_page_ids: Vec<Object> = Vec::new();

    for mut doc in documents {
        // ID 충돌 방지를 위한 객체 번호 재부여
        doc.renumber_objects_with(max_id);
        max_id = doc.max_id + 1;

        let pages = doc.get_pages();
        for (_page_num, page_id) in pages {
            target_page_ids.push(Object::Reference(page_id));
        }

        for (id, object) in doc.objects {
            target_doc.objects.insert(id, object);
        }
    }

    let pages_id = (max_id, 0);
    max_id += 1;
    let catalog_id = (max_id, 0);

    // 각 페이지의 Parent 참조를 신규 Pages 객체로 갱신
    for page_ref in &target_page_ids {
        if let Object::Reference(page_id) = page_ref {
            if let Ok(page_dict) = target_doc.get_object_mut(*page_id).and_then(|obj| obj.as_dict_mut()) {
                page_dict.set("Parent", Object::Reference(pages_id));
            }
        }
    }

    // 신규 Pages 사전 생성
    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Count" => target_page_ids.len() as i64,
        "Kids" => target_page_ids,
    };
    target_doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    // 신규 Catalog 사전 생성
    let catalog_dict = dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    };
    target_doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));

    target_doc.trailer.set("Root", Object::Reference(catalog_id));
    target_doc.max_id = max_id;
    target_doc.prune_objects();

    target_doc
        .save(output_path)
        .map_err(|e| format!("병합된 PDF 저장 실패: {}", e))?;

    Ok(output_path.to_string())
}

/// 통합 페이지 관리의 드래그 앤 드롭 재배치, 페이지 삭제, 회전, 다중 문서 삽입 결과를
/// 하나의 최종 PDF 파일로 내보냅니다.
pub fn organize_and_export_pages(
    page_specs: &[PageOrganizeSpec],
    output_path: &str,
) -> Result<String, String> {
    if page_specs.is_empty() {
        return Err("내보낼 페이지 목록이 비어 있습니다.".to_string());
    }

    // 1. 소스 파일 경로별 원본 문서 로드 캐시
    let mut doc_cache: HashMap<String, Document> = HashMap::new();
    for spec in page_specs {
        if !doc_cache.contains_key(&spec.source_path) {
            let doc = Document::load(&spec.source_path)
                .map_err(|e| format!("문서 '{}' 로드 실패: {}", spec.source_path, e))?;
            doc_cache.insert(spec.source_path.clone(), doc);
        }
    }

    let mut target_doc = Document::with_version("1.5");
    let mut max_id = 1;
    let mut target_page_ids: Vec<Object> = Vec::new();

    // 2. 지정된 페이지 순서대로 순회하며 타겟 문서에 객체 복사 및 회전 적용
    for spec in page_specs {
        let src_doc = match doc_cache.get(&spec.source_path) {
            Some(d) => d,
            None => continue,
        };

        let pages = src_doc.get_pages();
        let src_page_id = match pages.get(&spec.page_number) {
            Some(&id) => id,
            None => continue,
        };

        // 소스 문서를 클론하여 ID 재부여 후 필요한 객체들 복사
        let mut cloned_doc = src_doc.clone();
        cloned_doc.renumber_objects_with(max_id);
        max_id = cloned_doc.max_id + 1;

        let renumbered_page_id = (src_page_id.0 + (max_id - cloned_doc.max_id - 1), src_page_id.1);
        
        // 페이지 딕셔너리 가져와 회전(Rotate) 설정 적용
        let actual_page_id = match cloned_doc.get_pages().get(&spec.page_number) {
            Some(&id) => id,
            None => renumbered_page_id,
        };

        if let Ok(page_obj) = cloned_doc.get_object_mut(actual_page_id) {
            if let Ok(page_dict) = page_obj.as_dict_mut() {
                // 기존 회전값 조회
                let current_rot = page_dict
                    .get(b"Rotate")
                    .and_then(Object::as_i64)
                    .unwrap_or(0) as i32;
                let final_rot = (current_rot + spec.rotation) % 360;
                let final_rot = if final_rot < 0 { final_rot + 360 } else { final_rot };
                page_dict.set("Rotate", Object::Integer(final_rot as i64));
            }
        }

        target_page_ids.push(Object::Reference(actual_page_id));

        // 클론된 문서의 모든 객체를 타겟 문서로 통합
        for (id, object) in cloned_doc.objects {
            target_doc.objects.insert(id, object);
        }
    }

    let pages_id = (max_id, 0);
    max_id += 1;
    let catalog_id = (max_id, 0);

    // 각 페이지의 Parent 참조를 신규 Pages 객체로 갱신
    for page_ref in &target_page_ids {
        if let Object::Reference(page_id) = page_ref {
            if let Ok(page_dict) = target_doc.get_object_mut(*page_id).and_then(|obj| obj.as_dict_mut()) {
                page_dict.set("Parent", Object::Reference(pages_id));
            }
        }
    }

    // 신규 Pages 사전 생성
    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Count" => target_page_ids.len() as i64,
        "Kids" => target_page_ids,
    };
    target_doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    // 신규 Catalog 사전 생성
    let catalog_dict = dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    };
    target_doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));

    target_doc.trailer.set("Root", Object::Reference(catalog_id));
    target_doc.max_id = max_id;
    target_doc.prune_objects();

    target_doc
        .save(output_path)
        .map_err(|e| format!("페이지 재구성 PDF 저장 실패: {}", e))?;

    Ok(output_path.to_string())
}
