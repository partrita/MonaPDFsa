use monapdfsa_core::pdf::redact::{apply_redactions, RedactionRegion};
use base64::prelude::*;
use image::{ImageBuffer, Rgb};
use lopdf::Document;
use std::fs;
use std::io::Cursor;
use std::path::Path;

/// 모자이크 가림 테스트용 픽셀화 이미지 Data URL을 생성합니다.
fn create_test_mosaic_data_url(width: u32, height: u32) -> String {
    let mut img = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(width, height);
    let block_size = 8;

    for y in 0..height {
        for x in 0..width {
            let bx = x / block_size;
            let by = y / block_size;
            // 체커보드 모자이크 패턴 생성
            let c = if (bx + by) % 2 == 0 {
                [180u8, 200u8, 230u8]
            } else {
                [130u8, 160u8, 210u8]
            };
            img.put_pixel(x, y, Rgb(c));
        }
    }

    let mut png_bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .expect("PNG 인코딩 실패");

    format!("data:image/png;base64,{}", BASE64_STANDARD.encode(&png_bytes))
}

fn main() {
    println!("============================================================");
    println!("  MonaPDFsa - Local Structural Redaction Test Runner");
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

    let output_path = if Path::new("examples").exists() || Path::new("Cargo.toml").exists() && Path::new("src").exists() && !Path::new("../../examples").exists() {
        let _ = fs::create_dir_all("examples");
        "examples/sample_document_redacted.pdf"
    } else if Path::new("../../examples").exists() {
        "../../examples/sample_document_redacted.pdf"
    } else {
        let _ = fs::create_dir_all("examples");
        "examples/sample_document_redacted.pdf"
    };

    // 1. 모자이크 이미지 데이터 URL 생성
    let mosaic_data_url = create_test_mosaic_data_url(160, 40);

    // 2. 가림 영역 정의 (페이지 1 & 페이지 2의 민감 정보 타겟팅)
    let redactions = vec![
        // Page 1: API 키 블랙아웃 (Blackout)
        RedactionRegion {
            id: "redact_p1_apikey".to_string(),
            page: 1,
            x: 45.0,
            y: 670.0,
            width: 440.0,
            height: 24.0,
            style: "blackout".to_string(),
            image_data: None,
        },
        // Page 1: 비밀번호 모자이크 (Mosaic)
        RedactionRegion {
            id: "redact_p1_password".to_string(),
            page: 1,
            x: 45.0,
            y: 646.0,
            width: 380.0,
            height: 24.0,
            style: "mosaic".to_string(),
            image_data: Some(mosaic_data_url),
        },
        // Page 1: 주민번호/고객정보 화이트아웃 (Whiteout)
        RedactionRegion {
            id: "redact_p1_ssn".to_string(),
            page: 1,
            x: 45.0,
            y: 622.0,
            width: 360.0,
            height: 24.0,
            style: "whiteout".to_string(),
            image_data: None,
        },
        // Page 2: 재무 매출 데이터 블랙아웃 (Blackout)
        RedactionRegion {
            id: "redact_p2_revenue".to_string(),
            page: 2,
            x: 45.0,
            y: 646.0,
            width: 420.0,
            height: 50.0,
            style: "blackout".to_string(),
            image_data: None,
        },
    ];

    println!("🔧 적용할 가림 영역 (총 {}개):", redactions.len());
    for r in &redactions {
        println!(
            "  - [Page {}] {} 스타일 | 좌표 (x:{:.1}, y:{:.1}, w:{:.1}, h:{:.1})",
            r.page, r.style, r.x, r.y, r.width, r.height
        );
    }

    // 3. 구조적 가림 처리 실행
    println!("\n🚀 구조적 가림 처리(Structural Redaction) 엔진 실행 중...");
    apply_redactions(input_path, output_path, &redactions)
        .expect("가림 처리 적용 실패!");

    println!("✅ 가림 처리 완료! 생성된 파일: {}", output_path);

    // 4. 보안 검증: 가림 처리된 PDF 내부 텍스트 검증
    println!("\n🔍 [보안 및 무결성 자동 검증]");
    let doc = Document::load(output_path).expect("결과 PDF 문서 로드 실패");
    let pages = doc.get_pages();
    println!("   - 총 페이지 수: {} 페이지", pages.len());

    // Page 1 스트림 검사
    if let Some(&p1_id) = pages.get(&1) {
        let content_bytes = doc.get_page_content(p1_id).unwrap_or_default();
        let content_str = String::from_utf8_lossy(&content_bytes);

        println!("Page 1 content stream dump:\n{}", content_str);
        let check_secret1 = !content_str.contains("sk-secret-9988224411aaccbb-production");
        let check_secret2 = !content_str.contains("SuperSecretPassword123!");
        let check_secret3 = !content_str.contains("123-45-6789");
        let check_preserved = content_str.contains("CONFIDENTIAL DOCUMENT");

        println!("   ✓ API 키 스트림 제거: {}", if check_secret1 { "PASS (완전 파기됨)" } else { "FAIL (기저 텍스트 잔존)" });
        println!("   ✓ 비밀번호 스트림 제거: {}", if check_secret2 { "PASS (완전 파기됨)" } else { "FAIL (기저 텍스트 잔존)" });
        println!("   ✓ 고객 주민번호 스트림 제거: {}", if check_secret3 { "PASS (완전 파기됨)" } else { "FAIL (기저 텍스트 잔존)" });
        println!("   ✓ 비가림 영역 본문 보존: {}", if check_preserved { "PASS (정상 유지)" } else { "FAIL" });

        assert!(check_secret1 && check_secret2 && check_secret3, "보안 검증 실패: 민감 텍스트가 스트림에 남아있습니다!");
        assert!(check_preserved, "무결성 검증 실패: 비가림 본문이 손상되었습니다!");
    }

    println!("\n🎉 모든 테스트 및 검증이 완벽하게 통과되었습니다!");
    println!("============================================================\n");
}
