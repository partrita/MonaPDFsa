use lopdf::{dictionary, Document, Object, Stream};

/// 테스트 및 시연용 3페이지 샘플 PDF 문서(`sample_document.pdf`)를 생성하는 유틸리티 바이너리
fn main() {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let font_id = doc.new_object_id();

    // 기본 영문 폰트(Helvetica) 객체 정의
    let font_dict = dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    };
    doc.objects.insert(font_id, Object::Dictionary(font_dict));

    let mut page_ids = Vec::new();

    let sample_texts = [
        vec![
            "CONFIDENTIAL DOCUMENT - MONAPDFSA STUDIO",
            "Page 1: Project Overview & Secret Credentials",
            "API_KEY: sk-secret-9988224411aaccbb-production",
            "User Password: SuperSecretPassword123!",
            "Customer Name: John Doe (SSN: 123-45-6789)",
            "Drag over the text above using the Mosaic Tool to redact it!",
        ],
        vec![
            "CONFIDENTIAL DOCUMENT - PAGE 2",
            "Financial Statement Q4 & Private Revenue Data",
            "Gross Revenue: $14,250,000 USD",
            "Net Profit Margin: 34.5% (Internal Use Only)",
            "Bank Account: 8820-192-334110 Swift: MONAKR",
            "Use the Blackout Tool to cover this financial report.",
        ],
        vec![
            "MONAPDFSA STUDIO - PAGE 3",
            "PDF Merge, Split & Drag-and-Drop Page Organizer",
            "This document contains 3 distinct pages.",
            "You can test splitting this document into individual pages,",
            "reordering them in Page Studio, or redacting sensitive data!",
        ],
    ];

    for (_i, lines) in sample_texts.iter().enumerate() {
        let content_id = doc.new_object_id();
        let page_id = doc.new_object_id();

        // 텍스트 블록(BT ... ET) 스트림 작성
        let mut content = String::from("BT /F1 16 Tf 50 750 Td\n");
        for (line_idx, line) in lines.iter().enumerate() {
            if line_idx == 0 {
                content.push_str(&format!("({}) Tj\n", line));
            } else {
                content.push_str(&format!("T* ({}) Tj\n", line));
            }
        }
        content.push_str("ET");

        let stream = Stream::new(dictionary! {}, content.into_bytes());
        doc.objects.insert(content_id, Object::Stream(stream));

        // A4 규격 (595 x 842 pt) 페이지 딕셔너리 구성
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
        page_ids.push(Object::Reference(page_id));
    }

    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Count" => page_ids.len() as i64,
        "Kids" => page_ids,
    };
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let catalog_id = doc.new_object_id();
    let catalog_dict = dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    };
    doc.objects.insert(catalog_id, Object::Dictionary(catalog_dict));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    doc.save("sample_document.pdf").unwrap();
    println!("MonaPDFsa 3페이지 샘플 문서(sample_document.pdf)가 성공적으로 생성되었습니다.");
}
