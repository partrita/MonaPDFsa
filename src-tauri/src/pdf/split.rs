use lopdf::Document;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitRange {
    pub label: Option<String>,
    pub start: u32,
    pub end: u32,
}

/// Splits a PDF document according to the specified page ranges and saves them to `output_dir`.
pub fn split_pdf(
    input_path: &str,
    ranges: &[SplitRange],
    output_dir: &str,
    output_prefix: &str,
) -> Result<Vec<String>, String> {
    let base_doc = Document::load(input_path)
        .map_err(|e| format!("Failed to load input PDF '{}': {}", input_path, e))?;

    let total_pages = base_doc.get_pages().len() as u32;
    if total_pages == 0 {
        return Err("PDF document contains no pages".to_string());
    }

    if ranges.is_empty() {
        return Err("No page ranges provided for split".to_string());
    }

    let mut generated_files = Vec::new();

    for (_idx, range) in ranges.iter().enumerate() {
        let start = range.start.max(1);
        let end = range.end.min(total_pages);
        if start > end {
            continue;
        }

        let keep_set: HashSet<u32> = (start..=end).collect();
        let delete_list: Vec<u32> = (1..=total_pages)
            .filter(|p| !keep_set.contains(p))
            .collect();

        let mut doc = base_doc.clone();
        doc.delete_pages(&delete_list);
        doc.prune_objects();

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
            .map_err(|e| format!("Failed to save split PDF to '{}': {}", out_path_str, e))?;

        generated_files.push(out_path_str);
    }

    Ok(generated_files)
}

/// Helper function to parse user input string such as "1-3, 5, 8-10" into ranges
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
