use lopdf::{dictionary, Document, Object};
use std::fs;

/// Merge multiple PDF files into a single output PDF file.
pub fn merge_pdfs(input_paths: &[String], output_path: &str) -> Result<String, String> {
    if input_paths.is_empty() {
        return Err("No input PDF files provided".to_string());
    }

    if input_paths.len() == 1 {
        fs::copy(&input_paths[0], output_path)
            .map_err(|e| format!("Failed to copy single file: {}", e))?;
        return Ok(output_path.to_string());
    }

    let mut documents: Vec<Document> = Vec::new();
    for path in input_paths {
        let doc = Document::load(path)
            .map_err(|e| format!("Failed to load '{}': {}", path, e))?;
        documents.push(doc);
    }

    let mut max_id = 1;
    let mut target_doc = Document::with_version("1.5");
    let mut target_page_ids: Vec<Object> = Vec::new();

    for mut doc in documents {
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

    for page_ref in &target_page_ids {
        if let Object::Reference(page_id) = page_ref {
            if let Ok(page_dict) = target_doc.get_object_mut(*page_id).and_then(|obj| obj.as_dict_mut()) {
                page_dict.set("Parent", Object::Reference(pages_id));
            }
        }
    }

    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Count" => target_page_ids.len() as i64,
        "Kids" => target_page_ids,
    };
    target_doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

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
        .map_err(|e| format!("Failed to save merged PDF: {}", e))?;

    Ok(output_path.to_string())
}
