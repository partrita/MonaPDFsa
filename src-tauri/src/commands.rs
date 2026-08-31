use base64::prelude::*;
use lopdf::Document;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::pdf::merge::{merge_pdfs, organize_and_export_pages, PageOrganizeSpec};
use crate::pdf::redact::{apply_redactions, RedactionRegion};
use crate::pdf::split::{split_pdf, SplitRange};

/// 프론트엔드로 반환되는 PDF 파일 메타데이터 및 Base64 바이너리 정보
#[derive(Debug, Serialize, Deserialize)]
pub struct PdfFileInfo {
    /// 원본 파일 전체 경로
    pub file_path: String,
    /// 파일 이름 (예: document.pdf)
    pub file_name: String,
    /// 파일 크기 (바이트)
    pub file_size: u64,
    /// 총 페이지 수
    pub page_count: usize,
    /// 뷰어 렌더링용 Base64 인코딩 데이터 문자열
    pub base64_data: String,
}

/// 지정된 경로의 PDF 파일을 읽어 메타데이터와 Base64 데이터를 반환하는 Tauri 커맨드
#[tauri::command]
pub fn read_pdf_file(path: String) -> Result<PdfFileInfo, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", path));
    }

    let file_name = file_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "document.pdf".to_string());

    let bytes = fs::read(&path).map_err(|e| format!("파일 읽기 실패: {}", e))?;
    let file_size = bytes.len() as u64;

    // lopdf를 활용한 총 페이지 수 산출
    let page_count = match Document::load_mem(&bytes) {
        Ok(doc) => doc.get_pages().len(),
        Err(_) => 1,
    };

    let base64_data = BASE64_STANDARD.encode(&bytes);

    Ok(PdfFileInfo {
        file_path: path,
        file_name,
        file_size,
        page_count,
        base64_data,
    })
}

/// 여러 PDF 파일을 순서대로 병합하여 하나의 파일로 저장하는 Tauri 커맨드
#[tauri::command]
pub fn cmd_pdf_merge(input_paths: Vec<String>, output_path: String) -> Result<String, String> {
    merge_pdfs(&input_paths, &output_path)
}

/// 원본 PDF를 지정된 구간별로 분할하여 개별 파일들로 저장하는 Tauri 커맨드
#[tauri::command]
pub fn cmd_pdf_split(
    input_path: String,
    ranges: Vec<SplitRange>,
    output_dir: String,
    output_prefix: String,
) -> Result<Vec<String>, String> {
    split_pdf(&input_path, &ranges, &output_dir, &output_prefix)
}

/// 통합 페이지 스튜디오(Page Studio)의 드래그 앤 드롭 재배치, 회전, 삭제 결과에 따라
/// 다중 문서의 임의 페이지들을 새로운 PDF로 조립하여 내보내는 Tauri 커맨드
#[tauri::command]
pub fn cmd_pdf_organize_and_export(
    pages: Vec<PageOrganizeSpec>,
    output_path: String,
) -> Result<String, String> {
    organize_and_export_pages(&pages, &output_path)
}

/// 모자이크, 블랙아웃, 화이트아웃 가림 영역을 적용하고 기저 텍스트를 파기한 영구 가림 PDF를 저장하는 Tauri 커맨드
#[tauri::command]
pub fn cmd_pdf_apply_redactions(
    input_path: String,
    output_path: String,
    redactions: Vec<RedactionRegion>,
) -> Result<String, String> {
    apply_redactions(&input_path, &output_path, &redactions)
}

/// Base64 데이터를 디코딩하여 지정된 파일 경로에 직접 저장하는 유틸리티 커맨드
#[tauri::command]
pub fn save_file_bytes(output_path: String, base64_data: String) -> Result<String, String> {
    let b64_str = if let Some(pos) = base64_data.find(',') {
        &base64_data[pos + 1..]
    } else {
        base64_data.as_str()
    };

    let bytes = BASE64_STANDARD
        .decode(b64_str)
        .map_err(|e| format!("Base64 디코딩 실패: {}", e))?;

    fs::write(&output_path, bytes)
        .map_err(|e| format!("파일 쓰기 실패 '{}': {}", output_path, e))?;

    Ok(output_path)
}
