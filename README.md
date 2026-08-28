# MonaPDFsa - Cross-Platform GUI PDF Studio

A high-performance, cross-platform desktop PDF viewer, mosaic/blackout redaction tool, and PDF management application built with Rust's **Tauri v2** and **React + TypeScript + Tailwind CSS**.

Fully supports **Windows, macOS, and Linux**.

---

## Key Features

### 📁 PDF Management

| Feature | Description | Status |
| :--- | :--- | :---: |
| **Merge** | Seamlessly combine multiple PDF files into a single document. | ✅ Done |
| **Split** | Extract individual pages into separate files. | ✅ Done |
| **Compress** | Reduce file size by optimizing internal streams and removing redundant metadata. | 🗓️ Planned |
| **Rotate** | Quickly fix orientation by rotating all pages 90 degrees. | 🗓️ Planned |
| **Delete Pages** | Remove unwanted pages by specifying page numbers. | 🗓️ Planned |
| **Reorder Pages** | Change the sequence of pages within a document. | 🗓️ Planned |
| **Insert Pages** | Add pages from another PDF at a specific position. | 🗓️ Planned |

### 🔄 Conversion

| Feature | Description | Status |
| :--- | :--- | :---: |
| **Images to PDF** | Convert JPG and PNG images into high-quality PDF documents instantly. | 🗓️ Planned |
| **Word/PPT to PDF** | Native conversion for common office formats. | 🗓️ Planned |
| **OCR Support** | Extract text from scanned documents using a native Rust engine. | 🗓️ Planned |

### 🔒 Security

| Feature | Description | Status |
| :--- | :--- | :---: |
| **Password Protection** | Add password protection and encryption to your sensitive files. | 🗓️ Planned |

### 🔲 Redaction (Mosaic & Blackout)

| Feature | Description | Status |
| :--- | :--- | :---: |
| **Mosaic Redaction** | Mouse-drag region selection with real-time pixelated mosaic preview. | ✅ Done |
| **Blackout / Whiteout** | Apply solid black or white boxes to permanently hide content. | ✅ Done |
| **Permanent PDF Export** | Embed redactions as image stamps (XObject) via Rust `lopdf` backend. | ✅ Done |

---

## Roadmap

```
v0.1.0 (Current)
├── ✅ High-resolution PDF viewer (PDF.js based)
├── ✅ Cross-platform drag & drop
├── ✅ Mosaic / Blackout / Whiteout redaction
├── ✅ PDF Merge
└── ✅ PDF Split (range, single pages, full extraction)

v0.2.0 (Planned)
├── 🗓️ Compress — optimize streams & strip redundant metadata
├── 🗓️ Rotate — 90° rotation for all or selected pages
├── 🗓️ Delete Pages — remove pages by number
├── 🗓️ Reorder Pages — drag-and-drop page sequence editor
└── 🗓️ Insert Pages — inject pages from another PDF at a chosen position

v0.3.0 (Planned)
├── 🗓️ Images to PDF — batch JPG/PNG → PDF conversion
├── 🗓️ Password Protection — AES encryption & owner/user passwords
├── 🗓️ Word/PPT to PDF — native conversion for common office formats
└── 🗓️ OCR Support — extract text from scanned documents via native Rust engine
```

---

## Cross-Platform Support

| OS | WebView Runtime | Bundle Format | Build Prerequisites |
| :--- | :--- | :--- | :--- |
| **Windows** | Microsoft Edge WebView2 (built-in on Win10/11) | `.exe` (NSIS), `.msi` | C++ Build Tools (Visual Studio), Rust |
| **macOS** | Apple WKWebView (built-in) | `.dmg`, `.app` (Intel & Apple Silicon) | Xcode Command Line Tools, Rust |
| **Linux** | WebKitGTK 4.1 | `.deb`, `.AppImage` | `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev` |

### Cross-Platform UX & Shortcuts
1. **Native Drag & Drop**: Drag PDF files from Explorer / Finder / file manager directly onto the app window.
2. **Cross-platform shortcuts**:
   - macOS: `Cmd+O` (open), `Cmd+S` (save redaction), `Cmd+Z` (undo), `Cmd+±` (zoom)
   - Windows / Linux: `Ctrl+O`, `Ctrl+S`, `Ctrl+Z`, `Ctrl+±`
   - Tool shortcuts: `M` (mosaic), `B` (blackout), `W` (whiteout), `H` (pan)
3. **Native Dialogs**: OS-native open/save file panels.

---

## Build & Run

### Windows
```powershell
# Development
cargo tauri dev

# Release installer (.exe / .msi)
cargo tauri build
```
Output: `src-tauri/target/release/bundle/nsis/*.exe` or `msi/*.msi`

### macOS
```bash
cargo tauri dev
cargo tauri build
```
Output: `src-tauri/target/release/bundle/dmg/*.dmg` and `bundle/macos/*.app`

### Linux
```bash
cargo tauri dev
cargo tauri build --bundles deb
```
Output: `src-tauri/target/release/bundle/deb/*.deb`

### Automated 3-OS Release via GitHub Actions
The [`.github/workflows/release.yml`](.github/workflows/release.yml) file configures a Windows, macOS (Apple Silicon), and Linux (Ubuntu) build matrix. Pushing a Git tag will automatically build and publish installers for all three platforms as a GitHub Release.

---

## Sample PDF
A 3-page test document [`sample_document.pdf`](sample_document.pdf) is included at the project root.  
Open the app, click **Open PDF**, and select this file to immediately test redaction, split, and merge features!

