# MonaPDFsa - Cross-Platform GUI PDF Studio

A high-performance, cross-platform desktop PDF viewer, mosaic/blackout redaction tool, and visual drag-and-drop PDF page organizer built with Rust's **Tauri v2** and **React + TypeScript + Tailwind CSS**.

Fully supports **Windows, macOS, and Linux**.

---

## TODO (완료 상태)
 
- [x] **모자이크로 가려도 OCR에서 선택이 가능하다. 가능하지 않게 수정해야 하다.**
  - ✅ **해결 완료**: `pdf/redact.rs`에서 페이지의 `/Contents` 스트림을 디코딩 및 구문 분석하여 가림 영역(Bounding Box) 내부의 텍스트 연산자(`BT`, `Tj`, `TJ`, `'`, `"`, `ET`)와 어노테이션(`/Annots`)을 완전히 제거/치환(Sanitize)하여 내보냅니다. 이제 가려진 영역의 텍스트는 클립보드 복사, 검색, OCR 판독이 물리적으로 불가능합니다.
- [x] **앱 로고에 CF 라고 적혀있는데 그것도 수정이 필요, 앱이름도 수정이 필요하다.**
  - ✅ **해결 완료**: "CF (Cool Fermi)" 표기를 모나리자 테마의 **"MonaPDFsa"** 및 전용 브랜드 로고로 전면 교체하였습니다.
- [x] **프로그램 설치시 아이콘이 기본 tauri 아이콘이다, MonaPDFsa에 알맞게 모나리사 비슷한 아이콘을 만들어서 수정해줘.**
  - ✅ **해결 완료**: 모나리자 실루엣과 모던 PDF 스튜디오 테마를 결합한 고해상도 앱 아이콘 세트(`32x32`, `128x128`, `128x128@2x`, `icon.png`, `icon.ico`, `icon.icns`, `Square*.png`, `favicon`)를 제작하여 전 플랫폼 번들에 적용하였습니다.
- [x] **MacOS에서 설치시 다음 오류가 발생한다.**
  - [x] *“MonaPDFsa” is damaged and can’t be opened. You should move it to the Trash...*
  - ✅ **해결 완료**: macOS 게이트키퍼(Gatekeeper)의 미서명/미공증 앱 격리 속성(`com.apple.quarantine`) 해제 가이드라인을 본 문서 하단 및 번들 설정에 추가하였습니다. (터미널에서 `xattr -cr /Applications/MonaPDFsa.app` 실행)
- [x] **MacOS에서 사용해보면 모자이크 처리해도 실제 위치보다 작은 곳에 모자이크가 처리되는 버그가 있다.**
  - ✅ **해결 완료**: macOS Retina(High-DPI, `devicePixelRatio >= 2`) 디스플레이에서 캔버스 픽셀 버퍼 배율과 72 DPI PDF 포인트 좌표 변환 오차를 정밀 보정하여, 화면에서 드래그한 영역과 실제 PDF 출력 모자이크가 1:1로 일치하도록 수정하였습니다.
- [x] **PDF를 나누고 합치고 추가하고 이동시키는 기능은 하나의 뷰에서 실행되어서 마우스 드래그로 쉽게 사용되어야해.**
  - ✅ **해결 완료**: **"통합 페이지 스튜디오 (Page Studio)"** 탭을 추가하여, 여러 PDF를 불러와 썸네일 그리드에서 마우스 드래그로 페이지 순서 변경, 삭제, 90° 회전, 분할 기준점(✂️) 설정, 병합 내보내기를 한 화면에서 원스톱으로 처리할 수 있습니다.
- [x] **기능을 테스트하는 코드를 작성해서 빌드전에 테스트할 수 있게 해줘.**
  - ✅ **해결 완료**: Rust 백엔드 핵심 엔진 단위 테스트(`src-tauri/src/pdf/mod.rs`) 및 사전 빌드 프론트엔드/로직 검증 테스트(`tests/monapdfsa.test.mjs`)를 구축하였으며, `npm test` 및 `npm run build` 시 자동으로 사전 테스트가 실행됩니다.

---

## 🍏 macOS 설치 및 "손상됨" 오류 해결 가이드

Apple 개발자 유료 인증서로 공증(Notarization)되지 않은 앱을 인터넷에서 다운로드하여 설치할 경우, macOS Gatekeeper가 보안 격리 플래그(`com.apple.quarantine`)를 설정하여 아래와 같은 경고창을 표시합니다:

> **“MonaPDFsa” is damaged and can’t be opened. You should move it to the Trash.**

### 해결 방법 (1초 해결)
터미널(Terminal) 앱을 열고 아래 명령어를 실행하면 즉시 정상 실행됩니다:

```bash
# Applications 폴더에 설치된 MonaPDFsa 격리 속성 해제
xattr -cr /Applications/MonaPDFsa.app

# 또는 다운로드한 dmg 파일 자체의 격리 해제
xattr -d com.apple.quarantine MonaPDFsa.dmg
```

---

## Key Features

### 📁 통합 페이지 스튜디오 (Page Studio) & PDF 관리

| 기능 | 설명 | 상태 |
| :--- | :--- | :---: |
| **마우스 드래그 순서 변경** | 썸네일 카드를 마우스로 끌어다 놓아 페이지 순서를 자유롭게 재배치 | ✅ 완료 |
| **다중 PDF 추가/통합** | 여러 PDF 문서를 한 작업공간에 불러와 임의 순서로 조립 | ✅ 완료 |
| **페이지 회전 (Rotate)** | 시계/반시계 방향으로 개별 또는 전체 페이지 90° 회전 | ✅ 완료 |
| **페이지 삭제 (Delete)** | 불필요한 페이지를 원클릭으로 제거 | ✅ 완료 |
| **분할 지점 설정 (Split)** | 카드 하단 ✂️ 아이콘으로 분할 구분점을 지정하여 다중 PDF로 일괄 분할 | ✅ 완료 |
| **원스톱 병합 내보내기** | 재배치된 상태 그대로 단일 PDF 문서로 즉시 저장 | ✅ 완료 |

### 🔲 영구 가림 처리 (Redaction & Text Sanitization)

| 기능 | 설명 | 상태 |
| :--- | :--- | :---: |
| **모자이크 가림 (Mosaic)** | 실시간 픽셀화 블록 모자이크 프리뷰 및 DeviceRGB XObject 스탬프 임베딩 | ✅ 완료 |
| **블랙아웃 / 화이트아웃** | 단색 검정/흰색 박스로 민감 정보 완전 은폐 | ✅ 완료 |
| **OCR / 텍스트 선택 방지** | 가림 영역 내부의 PDF 텍스트 연산자 및 어노테이션을 파기하여 복사/검색/OCR 원천 차단 | ✅ 완료 |
| **Retina High-DPI 정밀 보정** | macOS Retina 화면에서도 1:1 완벽한 좌표 및 크기 일치 보장 | ✅ 완료 |

---

## 🧪 테스트 및 빌드

### 사전 테스트 실행
```bash
# 전체 단위 및 통합 테스트 실행 (10개 항목)
npm test
```

### 프로덕션 빌드 (테스트 자동 선행 실행)
```bash
npm run build
```

### 크로스 플랫폼 앱 실행 및 패키징

#### Windows
```powershell
cargo tauri dev
cargo tauri build
```

#### macOS
```bash
cargo tauri dev
cargo tauri build
```

#### Linux
```bash
cargo tauri dev
cargo tauri build --bundles deb
```

---

## Sample PDF
프로젝트 루트에 테스트용 3페이지 문서 [`sample_document.pdf`](sample_document.pdf)가 포함되어 있습니다.  
앱 실행 후 **PDF 열기**로 해당 파일을 열어 모자이크 가림(OCR 방지 검증) 및 통합 페이지 스튜디오 기능을 즉시 체험할 수 있습니다.
