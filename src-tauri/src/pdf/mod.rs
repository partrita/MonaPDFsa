pub mod merge;
pub mod redact;
pub mod split;

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{dictionary, Document, Object, Stream};
    use std::fs;
    use std::path::Path;

    /// Helper to construct a valid minimal 1-page PDF for unit tests.
    fn create_dummy_pdf(path: &str, text: &str) {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let font_id = doc.new_object_id();
        let content_id = doc.new_object_id();
        let page_id = doc.new_object_id();

        let content = format!("BT /F1 24 Tf 100 700 Td ({}) Tj ET", text);
        let stream = Stream::new(dictionary! {}, content.into_bytes());
        doc.objects.insert(content_id, Object::Stream(stream));

        let font_dict = dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        };
        doc.objects.insert(font_id, Object::Dictionary(font_dict));

        let page_dict = dictionary! {
            "Type" => "Page",
            "Parent" => Object::Reference(pages_id),
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
            "Contents" => Object::Reference(content_id),
            "Resources" => dictionary! {
                "Font" => dictionary! {
                    "F1" => Object::Reference(font_id),
                },
            },
        };
        doc.objects.insert(page_id, Object::Dictionary(page_dict));

        let pages_dict = dictionary! {
            "Type" => "Pages",
            "Count" => 1,
            "Kids" => vec![Object::Reference(page_id)],
        };
        doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

        let catalog_id = doc.new_object_id();
        let catalog_dict = dictionary! {
            "Type" => "Catalog",
            "Pages" => Object::Reference(pages_id),
        };
        doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));
        doc.trailer.set("Root", Object::Reference(catalog_id));

        doc.save(path).unwrap();
    }

    #[test]
    fn test_merge_and_split() {
        let tmp_dir = std::env::temp_dir().join("cool_fermi_tests");
        let _ = fs::create_dir_all(&tmp_dir);

        let pdf1 = tmp_dir.join("test1.pdf");
        let pdf2 = tmp_dir.join("test2.pdf");
        let merged_pdf = tmp_dir.join("merged.pdf");

        create_dummy_pdf(pdf1.to_str().unwrap(), "Hello Page 1");
        create_dummy_pdf(pdf2.to_str().unwrap(), "Hello Page 2");

        let inputs = vec![
            pdf1.to_str().unwrap().to_string(),
            pdf2.to_str().unwrap().to_string(),
        ];

        // 1. Test Merge
        let merge_res = merge::merge_pdfs(&inputs, merged_pdf.to_str().unwrap());
        assert!(merge_res.is_ok(), "Merge failed: {:?}", merge_res.err());

        let loaded_merged = Document::load(merged_pdf.to_str().unwrap()).unwrap();
        assert_eq!(loaded_merged.get_pages().len(), 2);

        // 2. Test Split
        let split_ranges = vec![
            split::SplitRange {
                label: Some("split_page1".to_string()),
                start: 1,
                end: 1,
            },
            split::SplitRange {
                label: Some("split_page2".to_string()),
                start: 2,
                end: 2,
            },
        ];

        let split_res = split::split_pdf(
            merged_pdf.to_str().unwrap(),
            &split_ranges,
            tmp_dir.to_str().unwrap(),
            "prefix",
        );
        assert!(split_res.is_ok(), "Split failed: {:?}", split_res.err());
        let files = split_res.unwrap();
        assert_eq!(files.len(), 2);
        assert!(Path::new(&files[0]).exists());
        assert!(Path::new(&files[1]).exists());

        // 3. Test Redaction (Blackout)
        let redacted_pdf = tmp_dir.join("redacted.pdf");
        let redactions = vec![redact::RedactionRegion {
            id: "box1".to_string(),
            page: 1,
            x: 100.0,
            y: 680.0,
            width: 150.0,
            height: 40.0,
            style: "blackout".to_string(),
            image_data: None,
        }];

        let redact_res = redact::apply_redactions(
            pdf1.to_str().unwrap(),
            redacted_pdf.to_str().unwrap(),
            &redactions,
        );
        assert!(redact_res.is_ok(), "Redact failed: {:?}", redact_res.err());
        assert!(redacted_pdf.exists());

        let _ = fs::remove_dir_all(tmp_dir);
    }
}
