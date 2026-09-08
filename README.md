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

### ⚡ 대용량 문서 성능 최적화 (100+ Pages Optimization)

- **단일 인스턴스 재사용 (`generateThumbnailsBatch`)**: 기존의 페이지별 중복 Base64 디코딩 및 Document 초기화를 제거하고, 단일 Document 인스턴스로 일괄 렌더링합니다.
- **메모리 및 CPU 오버헤드 감소**: 100페이지 이상 문서 로드 시 불필요한 가비지 컬렉션(GC) 스파이크를 방지합니다.

#### 벤치마크 비교 (100페이지 기준)
| 방식 | 소요 시간 | 비고 |
| :--- | :---: | :--- |
| **기존 방식 (N회 개별 로드)** | ~1.86 ms / decode loop | 매 페이지마다 Base64 전체 디코딩 및 문서 파싱 |
| **최적화 방식 (`generateThumbnailsBatch`)** | **~0.69 ms** | 단일 인스턴스로 일괄 처리 (**2.7배 이상 고속화, 63% 단축**) |

---

## 🧪 로컬 테스트 및 빌드 방법

### 1. 단위 및 무결성 테스트
```bash
# 프론트엔드 및 데이터 무결성 테스트 실행 (15개 항목)
npm test

# Rust 코어 엔진(monapdfsa-core) 테스트 실행
npm run test:rust
# 또는 cargo로 직접 실행
cargo test --workspace
```

### 2. 빌드 및 타입 검사 테스트
```bash
# TypeScript 타입 검사 및 Vite 번들링 빌드 테스트
npm run build
```

### 3. CLI 및 벤치마크 로컬 테스트
```bash
# 썸네일 생성 성능 벤치마크 측정
node tests/benchmark_thumbnails.mjs

# Rust 기반 모자이크/가림 처리 샘플 CLI 테스트 실행
npm run redact:example

# 테스트용 샘플 PDF 문서 생성
npm run sample:generate
```

### 4. 로컬 데스크톱 앱 실행 및 패키징 빌드
```bash
# Tauri 데스크톱 개발 모드 실행 (핫 리로드 지원)
cargo tauri dev

# 로컬 환경 플랫폼 배포 바이너리 패키징 빌드
cargo tauri build
```

---

## 🚀 GitHub Actions CI / Release 파이프라인

본 저장소의 워크플로우는 다음과 같이 분리되어 동작합니다:

1. **태그 없는 일반 `push` / `pull_request` ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))**:
   - `main` 브랜치에 코드가 push되거나 PR이 생성되면 실행됩니다.
   - **빌드 테스트 전용**: 단위 테스트(Node.js & Rust)를 수행하고 크로스 플랫폼(Windows, macOS, Linux) 데스크톱 앱 빌드를 검증하여 아티팩트로 저장합니다 (릴리스는 작성되지 않음).

2. **버전 태그 지정 후 `push` 시 자동 릴리스 ([`.github/workflows/release.yml`](.github/workflows/release.yml))**:
   - `v*` 형식의 Git Tag를 생성하고 push하면 **GitHub Releases가 자동으로 작성 및 발행**됩니다.
   - 사전 테스트 검증 후 Windows(`.exe`/`.msi`), macOS(`.dmg`), Linux(`.deb`/`.AppImage`) 설치 바이너리를 자동 빌드하여 Release에 첨부합니다.

```bash
# 릴리스 발행 예시:
# 1. 버전 태그 생성
git tag v0.1.0

# 2. 원격 저장소로 태그 푸시 (릴리스 자동 생성 트리거)
git push origin v0.1.0
```


