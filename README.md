# Cool Fermi - Cross-Platform GUI PDF Studio

Rust의 **Tauri v2**와 **React + TypeScript + Tailwind CSS**로 제작된 고성능 크로스 플랫폼 데스크톱 PDF 뷰어, 모자이크/블랙아웃 가림(Redaction) 처리 도구 및 PDF 병합/분할 애플리케이션입니다.

**Windows, macOS, Linux** 전 플랫폼을 완벽하게 지원합니다.

---

## 크로스 플랫폼 지원 (Cross-Platform Architecture)

| OS | 웹뷰 런타임 | 번들 패키지 형식 | 빌드 시 사전 요구사항 |
| :--- | :--- | :--- | :--- |
| **Windows** | Microsoft Edge WebView2 (Win10/11 기본 내장) | `.exe` (NSIS 설치 관리자), `.msi` | C++ Build Tools (Visual Studio), Rust |
| **macOS** | Apple WKWebView (macOS 기본 내장) | `.dmg`, `.app` (Intel & Apple Silicon M1/M2/M3) | Xcode Command Line Tools, Rust |
| **Linux** | WebKitGTK 4.1 | `.deb`, `.AppImage` | `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev` |

### 전 플랫폼 공통 UX & 편의 기능
1. **OS 네이티브 드래그 앤 드롭 (Drag & Drop)**:
   - Windows 파일 탐색기, macOS Finder, Linux 파일 관리자에서 PDF 파일을 앱 창 위로 직접 끌어다 놓으면 즉시 문서가 열립니다.
2. **크로스 플랫폼 단축키**:
   - macOS: `Cmd + O` (열기), `Cmd + S` (가림 저장), `Cmd + Z` (실행 취소), `Cmd + +/-` (확대/축소)
   - Windows / Linux: `Ctrl + O` (열기), `Ctrl + S` (가림 저장), `Ctrl + Z` (실행 취소), `Ctrl + +/-` (확대/축소)
   - 공통 도구 전환 단축키: `M` (모자이크), `B` (블랙아웃), `W` (화이트아웃), `H` (이동 모드)
3. **네이티브 다이얼로그**:
   - OS 기본 파일 선택/저장 대화상자(Native Open/Save Panel) 연동.

---

## 주요 기능 (Features)

### 1. 📄 고해상도 PDF 뷰어 & 내비게이션
- **PDF.js 기반 렌더링**: 벡터 텍스트와 그래픽을 왜곡 없이 고화질(HiDPI)로 부드럽게 렌더링.
- **페이지 탐색 & 줌 제어**: 이전/다음 페이지, 페이지 직접 입력, 줌(30% ~ 400%), 가로 맞춤, 페이지 전체 맞춤.
- **손(이동) 도구**: 마우스 드래그 패닝으로 대형 문서도 자유롭게 스크롤 탐색 가능.

### 2. 🔲 편리한 GUI 모자이크 & 가림 처리 (Redaction)
- **마우스 드래그 영역 선택**: 툴바에서 `모자이크`, `블랙아웃(검정 상자)`, `화이트아웃(흰 상자)` 도구를 선택하고 원하는 위치에 마우스로 드래그하면 즉시 가림 박스가 생성됩니다.
- **실시간 픽셀화 모자이크 프리뷰**: 원본 캔버스의 해당 픽셀들을 블록 단위로 평균 계산하여 실시간으로 픽셀화 모자이크를 보여줍니다.
- **모자이크 격자 크기 조절**: 툴바 슬라이더를 통해 격자 크기(4px ~ 36px)를 자유롭게 변경 가능합니다.
- **가림 목록 사이드바**: 등록된 모든 가림 영역을 페이지별로 확인, 이동, 개별 삭제 및 일괄 삭제 지원.
- **PDF 영구 적용 저장**: Rust 백엔드(`lopdf`) 엔진을 통해 원본 PDF에 모자이크 이미지 스탬프(XObject) 및 벡터 블랙아웃 사각형을 직접 임베딩하여 새로운 PDF로 저장합니다.

### 3. 📑 다중 PDF 병합 (Merge)
- 여러 PDF 문서를 한 번에 추가하고 위/아래 화살표 버튼으로 원하는 결합 순서로 손쉽게 재배열.
- 각 파일별 페이지 수 및 용량 확인 후 하나의 완전한 PDF로 병합.
- 병합 완료 후 즉시 뷰어에서 확인 가능.

### 4. ✂️ PDF 문서 분할 (Split)
- **페이지 범위 분할**: `1-3, 4, 5-8` 형식으로 자유롭게 지정하여 구간별 파일 생성.
- **모든 페이지 낱장 분할**: 문서의 모든 페이지를 `파일명_p001.pdf`, `_p002.pdf` 등의 낱장 PDF로 일괄 분할.
- **특정 페이지 추출**: 원하는 페이지만 쏙 골라내어 새 PDF로 저장.

---

## 각 OS별 빌드 및 실행 방법

### 1. Windows에서 실행/빌드
```powershell
# 개발 모드 실행
cargo tauri dev

# 설치 파일 (.exe installer / .msi) 생성
cargo tauri build
```
생성 위치: `src-tauri/target/release/bundle/nsis/*.exe` 또는 `msi/*.msi`

### 2. macOS에서 실행/빌드
```bash
# 개발 모드 실행
cargo tauri dev

# 디스크 이미지 (.dmg) 및 앱 번들 (.app) 생성
cargo tauri build
```
생성 위치: `src-tauri/target/release/bundle/dmg/*.dmg` 및 `bundle/macos/*.app`

### 3. Linux에서 실행/빌드
```bash
# 개발 모드 실행
cargo tauri dev

# 데비안 패키지 (.deb) 생성
cargo tauri build --bundles deb
```
생성 위치: `src-tauri/target/release/bundle/deb/*.deb`

### 4. GitHub Actions를 통한 자동 3사 OS 릴리스
저장소의 [`.github/workflows/release.yml`](.github/workflows/release.yml)에 Windows, macOS(Apple Silicon), Linux(Ubuntu) 빌드 매트릭스가 구성되어 있어, Git Tag를 생성하여 푸시하면 3개 운영체제용 설치 파일이 GitHub Release에 자동으로 빌드되어 게시됩니다.

---

## 샘플 PDF 테스트
프로젝트 루트 디렉터리에 3페이지짜리 테스트용 기밀 문서 샘플 [`sample_document.pdf`](sample_document.pdf)가 준비되어 있습니다.  
앱 실행 후 `PDF 열기`를 누르고 이 파일을 선택하여 모자이크 및 분할/병합 기능을 바로 테스트해보실 수 있습니다!
