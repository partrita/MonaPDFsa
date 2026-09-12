pub mod compress;
pub mod merge;
pub mod redact;
pub mod split;

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{dictionary, Document, Dictionary, Object, Stream};
    use std::fs;
    use std::path::Path;

    /// 단위 테스트용 단일 페이지 더미 PDF 문서를 메모리 및 파일로 생성하는 헬퍼 함수
    fn create_dummy_pdf(path: &str, text: &str) {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let font_id = doc.new_object_id();
        let content_id = doc.new_object_id();
        let page_id = doc.new_object_id();

        // 텍스트 블록 생성 (좌표 100, 700에 텍스트 렌더링)
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
    fn test_monapdfsa_core_features() {
        let tmp_dir = std::env::temp_dir().join("monapdfsa_unit_tests");
        let _ = fs::create_dir_all(&tmp_dir);

        let pdf1 = tmp_dir.join("test1.pdf");
        let pdf2 = tmp_dir.join("test2.pdf");
        let merged_pdf = tmp_dir.join("merged.pdf");

        create_dummy_pdf(pdf1.to_str().unwrap(), "SECRET_PASSWORD_123");
        create_dummy_pdf(pdf2.to_str().unwrap(), "Hello Page 2");

        let inputs = vec![
            pdf1.to_str().unwrap().to_string(),
            pdf2.to_str().unwrap().to_string(),
        ];

        // 1. [병합 테스트] 2개의 1페이지 PDF를 2페이지 단일 문서로 병합
        let merge_res = merge::merge_pdfs(&inputs, merged_pdf.to_str().unwrap());
        assert!(merge_res.is_ok(), "PDF 병합 실패: {:?}", merge_res.err());

        let loaded_merged = Document::load(merged_pdf.to_str().unwrap()).unwrap();
        assert_eq!(loaded_merged.get_pages().len(), 2, "병합된 페이지 수는 2여야 합니다.");

        // 2. [분할 테스트] 2페이지 문서를 낱장으로 분할
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
        assert!(split_res.is_ok(), "PDF 분할 실패: {:?}", split_res.err());
        let files = split_res.unwrap();
        assert_eq!(files.len(), 2);
        assert!(Path::new(&files[0]).exists());
        assert!(Path::new(&files[1]).exists());

        // 3. [보안 가림 및 OCR/텍스트 파기 테스트]
        // 비밀번호 텍스트 위치(100, 700)에 블랙아웃 가림 적용
        let redacted_pdf = tmp_dir.join("redacted.pdf");
        let redactions = vec![redact::RedactionRegion {
            id: "box1".to_string(),
            page: 1,
            x: 90.0,
            y: 680.0,
            width: 250.0,
            height: 50.0,
            style: "blackout".to_string(),
            image_data: None,
        }];

        let redact_res = redact::apply_redactions(
            pdf1.to_str().unwrap(),
            redacted_pdf.to_str().unwrap(),
            &redactions,
        );
        assert!(redact_res.is_ok(), "가림 처리 실패: {:?}", redact_res.err());
        assert!(redacted_pdf.exists());

        // 가림 처리된 문서 내에 'SECRET_PASSWORD_123' 문자열이 완전히 제거되었는지 바이트 검증
        let redacted_bytes = fs::read(&redacted_pdf).unwrap();
        let redacted_doc = Document::load_mem(&redacted_bytes).unwrap();
        let pages = redacted_doc.get_pages();
        let page1_id = pages.get(&1).unwrap();
        
        // 컨텐츠 스트림에서 원본 비밀 텍스트가 사라졌는지 확인
        let content_data = redacted_doc.get_page_content(*page1_id).unwrap();
        let content_str = String::from_utf8_lossy(&content_data);
        assert!(
            !content_str.contains("SECRET_PASSWORD_123"),
            "가림 처리된 스트림에 기저 텍스트가 남아있지 않아야 합니다!"
        );

        // 4. [통합 페이지 스튜디오 재배치/회전 테스트]
        let organized_pdf = tmp_dir.join("organized.pdf");
        let organize_specs = vec![
            merge::PageOrganizeSpec {
                source_path: pdf2.to_str().unwrap().to_string(),
                page_number: 1,
                rotation: 90,
            },
            merge::PageOrganizeSpec {
                source_path: pdf1.to_str().unwrap().to_string(),
                page_number: 1,
                rotation: 0,
            },
        ];

        let org_res = merge::organize_and_export_pages(&organize_specs, organized_pdf.to_str().unwrap());
        assert!(org_res.is_ok(), "페이지 재배치 내보내기 실패: {:?}", org_res.err());
        let loaded_org = Document::load(organized_pdf.to_str().unwrap()).unwrap();
        assert_eq!(loaded_org.get_pages().len(), 2);

        let _ = fs::remove_dir_all(tmp_dir);
    }

    /// 단위 테스트용 더미 PDF 생성 ( 이미지 + 텍스트 포함 )
    fn create_dummy_pdf_with_image(path: &str, text: &str) {
        use image::codecs::jpeg::JpegEncoder;
        use image::{ImageBuffer, Rgb};

        // 테스트용 JPEG 이미지를 메모리로 생성 ( image 크레이트 사용 )
        let img_buf = ImageBuffer::from_fn(400, 300, |x, y| {
            let r = ((x * 255) / 400) as u8;
            let g = ((y * 255) / 300) as u8;
            let b = 128;
            Rgb([r, g, b])
        });
        let mut jpeg = Vec::new();
        let mut enc = JpegEncoder::new_with_quality(&mut jpeg, 90);
        enc.encode(img_buf.as_raw(), 400, 300, image::ExtendedColorType::Rgb8).unwrap();

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

        let img_id = doc.new_object_id();
        let mut img_dict = Dictionary::new();
        img_dict.set("Type", Object::Name(b"XObject".to_vec()));
        img_dict.set("Subtype", Object::Name(b"Image".to_vec()));
        img_dict.set("Width", 400);
        img_dict.set("Height", 300);
        img_dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
        img_dict.set("BitsPerComponent", 8);
        img_dict.set("Filter", Object::Name(b"DCTDecode".to_vec()));
        doc.objects.insert(img_id, Object::Stream(Stream::new(img_dict, jpeg)));

        let page_dict = dictionary! {
            "Type" => "Page",
            "Parent" => Object::Reference(pages_id),
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
            "Contents" => Object::Reference(content_id),
            "Resources" => dictionary! {
                "Font" => dictionary! {
                    "F1" => Object::Reference(font_id),
                },
                "XObject" => dictionary! {
                    "Im1" => Object::Reference(img_id),
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
    fn test_compress_pdf() {
        use crate::pdf::compress::{compress_pdf, CompressionOptions};

        let tmp_dir = std::env::temp_dir().join("monapdfsa_compress_tests");
        let _ = fs::create_dir_all(&tmp_dir);

        let input = tmp_dir.join("compress_input.pdf");
        let output = tmp_dir.join("compress_output.pdf");

        create_dummy_pdf_with_image(input.to_str().unwrap(), "COMPRESS_TEST_TEXT_123");
        let original_size = fs::metadata(&input).unwrap().len();

        // 레벨 80: 이미지 재인코딩 + 스트림 압축
        let res = compress_pdf(
            input.to_str().unwrap(),
            &CompressionOptions {
                level: 80,
                output_path: output.to_str().unwrap().to_string(),
            },
        );
        assert!(res.is_ok(), "PDF 압축 실패: {:?}", res.err());
        let result = res.unwrap();
        assert!(output.exists(), "출력 파일이 생성되지 않음");
        assert_eq!(result.pages, 1, " 페이지 수는 1 유지");
        assert!(result.image_count >= 1, "이미지가 재인코딩되어야 함");
        assert!(result.compressed_size < original_size,
            "압축 후 크기가 줄어들어야 함: {} >= {}", result.compressed_size, original_size);

        // 텍스트 선택 가능 유지 검증
        let out_doc = Document::load(output.to_str().unwrap()).unwrap();
        let pages = out_doc.get_pages();
        let page_id = pages.get(&1).unwrap();
        let content = out_doc.get_page_content(*page_id).unwrap();
        let content_str = String::from_utf8_lossy(&content);
        assert!(
            content_str.contains("COMPRESS_TEST_TEXT_123"),
            "압축 후 텍스트가 사라졌습니다!"
        );

        // 레벨 0: 무손실 압축만, 텍스트 유지
        let output0 = tmp_dir.join("compress_output0.pdf");
        let res0 = compress_pdf(
            input.to_str().unwrap(),
            &CompressionOptions {
                level: 0,
                output_path: output0.to_str().unwrap().to_string(),
            },
        );
        assert!(res0.is_ok(), "무손일 압축 실패: {:?}", res0.err());
        assert!(output0.exists());

        let _ = fs::remove_dir_all(tmp_dir);
    }
}
