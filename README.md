# MonaPDFsa - Cross-Platform PDF Editor

[![Manual Release](https://github.com/partrita/MonaPDFsa/actions/workflows/release.yml/badge.svg)](https://github.com/partrita/MonaPDFsa/actions/workflows/release.yml)

A high-performance, cross-platform desktop PDF viewer, mosaic/blackout redaction tool, and visual drag-and-drop PDF page organizer built with Rust's **Tauri v2** and **React + TypeScript + Tailwind CSS**.

Fully supports **Windows, macOS, and Linux**.

---

## 🍏 macOS 설치 및 "손상됨" 오류 해결 가이드

Apple 개발자 유료 인증서로 공증(Notarization)되지 않은 앱을 인터넷에서 다운로드하여 설치할 경우, macOS Gatekeeper가 보안 격리 플래그(`com.apple.quarantine`)를 설정하여 아래와 같은 경고창을 표시합니다:

> **“MonaPDFsa” is damaged and can’t be opened. You should move it to the Trash.**

### 해결 방법
터미널(Terminal) 앱을 열고 아래 명령어를 실행하면 즉시 정상 실행됩니다:

```bash
# Applications 폴더에 설치된 MonaPDFsa 격리 속성 해제
xattr -cr /Applications/MonaPDFsa.app

# 또는 다운로드한 dmg 파일 자체의 격리 해제
xattr -d com.apple.quarantine MonaPDFsa.dmg
```

---

## Key Features

### 📁 통합 페이지 관리 (Page Organizer)

| 기능                       | 설명                                                               |  상태  |
| :------------------------- | :----------------------------------------------------------------- | :----: |
| **순서 변경**              | 썸네일 카드로 페이지 순서를 자유롭게 재배치                        | ✅ 완료 |
| **다중 PDF 추가/통합**     | 여러 PDF 문서를 한 작업공간에 불러와 임의 순서로 조립              | ✅ 완료 |
| **페이지 회전 (Rotate)**   | 시계/반시계 방향으로 개별 또는 전체 페이지 90° 회전                | ✅ 완료 |
| **페이지 삭제 (Delete)**   | 불필요한 페이지를 원클릭으로 제거                                  | ✅ 완료 |
| **분할 지점 설정 (Split)** | 카드 하단 ✂️ 아이콘으로 분할 구분점을 지정하여 다중 PDF로 일괄 분할 | ✅ 완료 |
| **원스톱 병합 내보내기**   | 재배치된 상태 그대로 단일 PDF 문서로 즉시 저장                     | ✅ 완료 |

### 🔲 영구 가림 처리 (Redaction & Text Sanitization)

| 기능                          | 설명                                                                                |  상태  |
| :---------------------------- | :---------------------------------------------------------------------------------- | :----: |
| **모자이크 가림 (Mosaic)**    | 실시간 픽셀화 블록 모자이크 프리뷰 및 DeviceRGB XObject 스탬프 임베딩               | ✅ 완료 |
| **블랙아웃 / 화이트아웃**     | 단색 검정/흰색 박스로 민감 정보 완전 은폐                                           | ✅ 완료 |
| **OCR / 텍스트 선택 방지**    | 가림 영역 내부의 PDF 텍스트 연산자 및 어노테이션을 파기하여 복사/검색/OCR 원천 차단 | ✅ 완료 |
| **Retina High-DPI 정밀 보정** | macOS Retina 화면에서도 1:1 완벽한 좌표 및 크기 일치 보장                           | ✅ 완료 |

---

## 🧪 테스트 및 빌드

### 단위/통합 테스트 실행
```bash
# 프론트엔드 및 무결성 테스트 (12개 항목)
npm test

# Rust 코어 엔진 테스트
npm run test:rust
```

### 프로덕션 번들 빌드
```bash
npm run build
```

### 로컬 데스크톱 앱 실행 및 패키징
```bash
# 개발 모드 실행
cargo tauri dev

# 플랫폼별 배포 바이너리 빌드
cargo tauri build
```

---

## 🚀 GitHub Actions CI / Release 파이프라인

본 저장소는 **“빌드는 매 커밋마다 자동 검증 후 릴리즈 생성”** 패턴을 따릅니다:

1. **자동 CI 빌드 및 아티팩트 저장 ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))**:
   - `main` 브랜치로 `push`되거나 `pull_request` 생성 시 자동으로 실행됩니다.
   - 단위 테스트(`npm test`)를 수행하고 Windows, macOS, Linux 번들을 빌드하여 **GitHub Actions Artifacts**로 업로드합니다.
2. **릴리스 발행 ([`.github/workflows/release.yml`](.github/workflows/release.yml))**:
   - GitHub Actions를 통해 Windows, macOS, Linux 크로스 플랫폼 바이너리 설치 파일(`.dmg`, `.deb`, `.appimage`, `.exe`/`.msi`)이 생성되어 GitHub Releases에 배포됩니다.
   - 버전 태그(`v*`) 푸시 또는 Actions 탭의 수동 트리거(workflow_dispatch)로도 자유롭게 실행할 수 있습니다.

---

## Sample PDF
`examples/` 폴더에 테스트용 3페이지 문서 [`sample_document.pdf`](examples/sample_document.pdf) 및 가림 처리 예제 [`sample_document_redacted.pdf`](examples/sample_document_redacted.pdf)가 포함되어 있습니다.  
앱 실행 후 **PDF 열기**로 해당 파일을 열어 모자이크 가림(OCR 방지 검증) 및 페이지 관리 기능을 즉시 체험할 수 있습니다.
