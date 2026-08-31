use lopdf::Document;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

/// PDF 분할 구간(시작/종료 페이지 및 파일 접미사 레이블) 명세 구조체
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitRange {
    /// 생성될 파일의 이름 레이블 (미지정 시 자동 생성)
    pub label: Option<String>,
    /// 1부터 시작하는 분할 시작 페이지 번호 (포함)
    pub start: u32,
    /// 1부터 시작하는 분할 종료 페이지 번호 (포함)
    pub end: u32,
}

/// 단일 원본 PDF 문서를 지정된 페이지 범위 목록(`ranges`)에 따라 여러 개의 개별 PDF 파일로 분할하여 `output_dir`에 저장합니다.
///
/// **동작 원리**:
/// 1. 원본 문서를 로드한 뒤 전체 페이지 수를 산출합니다.
/// 2. 각 범위(`start..=end`)마다 유지할 페이지 집합을 제외한 나머지 페이지들을 `delete_pages`로 삭제합니다.
/// 3. `prune_objects`를 호출하여 불필요해진 고아 객체들을 제거하고 최적화된 상태로 파일 시스템에 저장합니다.
pub fn split_pdf(
    input_path: &str,
    ranges: &[SplitRange],
    output_dir: &str,
    output_prefix: &str,
) -> Result<Vec<String>, String> {
    let base_doc = Document::load(input_path)
        .map_err(|e| format!("원본 PDF 파일 '{}' 로드 실패: {}", input_path, e))?;

    let total_pages = base_doc.get_pages().len() as u32;
    if total_pages == 0 {
        return Err("PDF 문서에 페이지가 존재하지 않습니다.".to_string());
    }

    if ranges.is_empty() {
        return Err("분할할 페이지 구간이 제공되지 않았습니다.".to_string());
    }

    let mut generated_files = Vec::new();

    for (_idx, range) in ranges.iter().enumerate() {
        let start = range.start.max(1);
        let end = range.end.min(total_pages);
        if start > end {
            continue;
        }

        // 보존할 페이지 및 삭제 대상 페이지 목록 계산 (1-based 인덱스)
        let keep_set: HashSet<u32> = (start..=end).collect();
        let delete_list: Vec<u32> = (1..=total_pages)
            .filter(|p| !keep_set.contains(p))
            .collect();

        let mut doc = base_doc.clone();
        doc.delete_pages(&delete_list);
        doc.prune_objects();

        // 파일명 생성
        let default_label = if start == end {
            format!("{}_p{:03}", output_prefix, start)
        } else {
            format!("{}_p{:03}-p{:03}", output_prefix, start, end)
        };

        let file_label = range.label.as_deref().unwrap_or(&default_label);
        let out_filename = if file_label.to_lowercase().ends_with(".pdf") {
            file_label.to_string()
        } else {
            format!("{}.pdf", file_label)
        };

        let out_path = Path::new(output_dir).join(out_filename);
        let out_path_str = out_path.to_string_lossy().to_string();

        doc.save(&out_path_str)
            .map_err(|e| format!("분할된 PDF 파일 '{}' 저장 실패: {}", out_path_str, e))?;

        generated_files.push(out_path_str);
    }

    Ok(generated_files)
}

/// 사용자가 입력한 페이지 범위 문자열(예: "1-3, 5, 8-10")을 파싱하여 `SplitRange` 목록으로 변환합니다.
pub fn parse_page_ranges(input: &str, max_pages: u32) -> Vec<SplitRange> {
    let mut ranges = Vec::new();
    for part in input.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some((s_str, e_str)) = part.split_once('-') {
            if let (Ok(s), Ok(e)) = (s_str.trim().parse::<u32>(), e_str.trim().parse::<u32>()) {
                let start = s.clamp(1, max_pages);
                let end = e.clamp(start, max_pages);
                ranges.push(SplitRange {
                    label: Some(format!("part_{}_{}", start, end)),
                    start,
                    end,
                });
            }
        } else if let Ok(page) = part.parse::<u32>() {
            let p = page.clamp(1, max_pages);
            ranges.push(SplitRange {
                label: Some(format!("page_{}", p)),
                start: p,
                end: p,
            });
        }
    }
    ranges
}
