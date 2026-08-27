use base64::prelude::*;
use lopdf::Document;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::pdf::merge::merge_pdfs;
use crate::pdf::redact::{apply_redactions, RedactionRegion};
use crate::pdf::split::{split_pdf, SplitRange};

#[derive(Debug, Serialize, Deserialize)]
pub struct PdfFileInfo {
    pub file_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub page_count: usize,
    pub base64_data: String,
}

#[tauri::command]
pub fn read_pdf_file(path: String) -> Result<PdfFileInfo, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    let file_name = file_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "document.pdf".to_string());

    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let file_size = bytes.len() as u64;

    // Get page count using lopdf
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

#[tauri::command]
pub fn cmd_pdf_merge(input_paths: Vec<String>, output_path: String) -> Result<String, String> {
    merge_pdfs(&input_paths, &output_path)
}

#[tauri::command]
pub fn cmd_pdf_split(
    input_path: String,
    ranges: Vec<SplitRange>,
    output_dir: String,
    output_prefix: String,
) -> Result<Vec<String>, String> {
    split_pdf(&input_path, &ranges, &output_dir, &output_prefix)
}

#[tauri::command]
pub fn cmd_pdf_apply_redactions(
    input_path: String,
    output_path: String,
    redactions: Vec<RedactionRegion>,
) -> Result<String, String> {
    apply_redactions(&input_path, &output_path, &redactions)
}

#[tauri::command]
pub fn save_file_bytes(output_path: String, base64_data: String) -> Result<String, String> {
    let b64_str = if let Some(pos) = base64_data.find(',') {
        &base64_data[pos + 1..]
    } else {
        base64_data.as_str()
    };

    let bytes = BASE64_STANDARD
        .decode(b64_str)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    fs::write(&output_path, bytes)
        .map_err(|e| format!("Failed to write file to '{}': {}", output_path, e))?;

    Ok(output_path)
}
