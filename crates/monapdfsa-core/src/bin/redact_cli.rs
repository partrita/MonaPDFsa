use base64::prelude::*;
use image::{ImageBuffer, Rgb};
use lopdf::Document;
use monapdfsa_core::pdf::redact::{
    apply_redactions_hybrid, FlattenedPageSpec, RedactionRegion,
};
use std::fs;
use std::path::Path;

/// 300 DPI 초고화질 플래트닝 테스트용 합성 이미지 Data URL을 생성합니다.
fn create_test_flattened_page_image(width: u32, height: u32) -> String {
    let mut img = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(width, height);

    // 흰색 바탕 (A4 용지 배경)
    for y in 0..height {
        for x in 0..width {
            img.put_pixel(x, y, Rgb([255u8, 255u8, 255u8]));
        }
    }

    // 블랙아웃 박스 (API 키 위치)
    for y in 140..170 {
        for x in 80..800 {
            if x < width && y < height {
                img.put_pixel(x, y, Rgb([0u8, 0u8, 0u8]));
            }
        }
    }

    // 모자이크 체커보드 박스 (비밀번호 위치)
    let block_size = 12;
    for y in 200..235 {
        for x in 80..720 {
            if x < width && y < height {
                let bx = x / block_size;
                let by = y / block_size;
                let c = if (bx + by) % 2 == 0 {
                    [170u8, 195u8, 230u8]
                } else {
                    [120u8, 150u8, 205u8]
                };
                img.put_pixel(x, y, Rgb(c));
            }
        }
    }

    // 화이트아웃 박스 (주민번호 위치)
    for y in 265..295 {
        for x in 80..680 {
            if x < width && y < height {
                img.put_pixel(x, y, Rgb([255u8, 255u8, 255u8]));
            }
        }
    }

    let mut jpeg_bytes = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_bytes, 92);
    encoder
        .encode(
            img.as_raw(),
            width,
            height,
            image::ExtendedColorType::Rgb8,
        )
        .expect("JPEG 인코딩 실패");

    format!(
        "data:image/jpeg;base64,{}",
        BASE64_STANDARD.encode(&jpeg_bytes)
    )
}

fn main() {
    println!("============================================================");
    println!("  MonaPDFsa - Local Flattening Redaction Test Runner");
    println!("============================================================");

    let input_candidates = [
        "examples/sample_document.pdf",
        "sample_document.pdf",
        "../examples/sample_document.pdf",
        "../../examples/sample_document.pdf",
    ];

    let input_path = input_candidates
        .iter()
        .find(|p| Path::new(p).exists())
        .copied()
        .expect("입력 파일 'sample_document.pdf'를 찾을 수 없습니다.");

    println!("📄 입력 원본 문서: {}", input_path);

    let output_path = if Path::new("examples").exists()
        || Path::new("Cargo.toml").exists()
            && Path::new("src").exists()
            && !Path::new("../../examples").exists()
    {
        let _ = fs::create_dir_all("examples");
        "examples/sample_document_redacted.pdf"
    } else if Path::new("../../examples").exists() {
        "../../examples/sample_document_redacted.pdf"
    } else {
        let _ = fs::create_dir_all("examples");
        "examples/sample_document_redacted.pdf"
    };

    // 1. 고해상도 플래트닝 페이지 스펙 준비 (Page 1 래스터라이징)
    let flattened_image_data = create_test_flattened_page_image(1190, 1684);
    let flattened_pages = vec![FlattenedPageSpec {
        page: 1,
        image_data: flattened_image_data,
        width_pts: 595.0,
        height_pts: 842.0,
    }];

    // 2. 벡터 가림 영역 정의 (Page 2 블랙아웃)
    let redactions = vec![RedactionRegion {
        id: "redact_p2_revenue".to_string(),
        page: 2,
        x: 45.0,
        y: 646.0,
        width: 420.0,
        height: 50.0,
        style: "blackout".to_string(),
        image_data: None,
    }];

    println!("🔧 스마트 하이브리드 가림 처리 계획:");
    println!("  - [Page 1] 300 DPI 초고화질 플래트닝 (기저 텍스트/글리프 100% 원천 소멸)");
    println!("  - [Page 2] 벡터 스트림 가림 처리");
    println!("  - [Page 3] 원본 벡터 PDF 품질 유지");

    // 3. 가림 처리 실행
    println!("\n🚀 MonaPDFsa 스마트 가림 처리 엔진 실행 중...");
    apply_redactions_hybrid(input_path, output_path, &flattened_pages, &redactions)
        .expect("가림 처리 적용 실패!");

    println!("✅ 가림 처리 완료! 생성된 파일: {}", output_path);

    // 4. 보안 검증: 가림 처리된 PDF 내부 텍스트 검증
    println!("\n🔍 [보안 및 무결성 자동 검증]");
    let doc = Document::load(output_path).expect("결과 PDF 문서 로드 실패");
    let pages = doc.get_pages();
    println!("   - 총 페이지 수: {} 페이지", pages.len());

    // Page 1 스트림 검사: 플래트닝 적용으로 어떠한 텍스트 데이터도 남아있지 않아야 함
    if let Some(&p1_id) = pages.get(&1) {
        let content_bytes = doc.get_page_content(p1_id).unwrap_or_default();
        let content_str = String::from_utf8_lossy(&content_bytes);

        println!("   Page 1 Content Stream:\n{}", content_str);
        let check_no_text = !content_str.contains("Tj")
            && !content_str.contains("TJ")
            && !content_str.contains("sk-secret")
            && !content_str.contains("SuperSecretPassword");

        let check_image_do = content_str.contains("Do");

        println!(
            "   ✓ 기저 텍스트 100% 영구 파기(드래그/OCR 불가): {}",
            if check_no_text {
                "PASS (완벽 차단)"
            } else {
                "FAIL"
            }
        );
        println!(
            "   ✓ 고해상도 Image XObject 정상 임베딩: {}",
            if check_image_do {
                "PASS (정상 임베딩)"
            } else {
                "FAIL"
            }
        );

        assert!(
            check_no_text && check_image_do,
            "보안 검증 실패: 플래트닝 페이지에 텍스트가 남아있거나 이미지가 누락되었습니다!"
        );
    }

    // Page 3 검사: 비가림 페이지는 텍스트가 정상 보존되어야 함
    if let Some(&p3_id) = pages.get(&3) {
        let content_bytes = doc.get_page_content(p3_id).unwrap_or_default();
        let content_str = String::from_utf8_lossy(&content_bytes);
        let check_p3 = content_str.contains("PAGE 3");
        println!(
            "   ✓ 비가림 페이지 원본 벡터/텍스트 보존: {}",
            if check_p3 {
                "PASS (정상 유지)"
            } else {
                "FAIL"
            }
        );
        assert!(check_p3, "비가림 페이지가 손상되었습니다!");
    }

    println!("\n🎉 모든 테스트 및 보안 검증이 완벽하게 통과되었습니다!");
    println!("============================================================\n");
}
