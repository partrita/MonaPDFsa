# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-10-07

### Added
- **Image Import Support**: Add support to import image files (JPG, PNG) into the page manager and assemble them into merged PDF documents.
- **Continuous Scroll Navigation**: Enable smooth mouse wheel scrolling to navigate through PDF pages in the viewer.
- **Redaction-Preserving PDF Optimization**: Automatically apply active in-progress redactions when compressing PDF files without losing edits.

### Fixed
- **Button Contrast and Visibility**: Add complete Rosé Pine Dawn color scales (50-900) in Tailwind CSS. Improve button borders, disabled state colors, and text contrast across all components to eliminate invisible buttons.
- **Tab Height Consistency**: Harmonize header bar heights between the Viewer tab and the Page Manager tab.
- **Page Flip Defect**: Fix defect where PDF pages showed vertically flipped after switching back from the Page Manager tab.
- **Notification Toast Unification**: Harmonize floating toast notification design and auto-dismiss behavior across all tabs.

## [0.2.0] - 2026-10-07

### Added
- **Target-Size PDF Compression**: Target capacity optimization using DCT compression and binary search quality fitting.
- **Rosé Pine Palette**: Initial Rosé Pine and Rosé Pine Dawn theme support.
- **Responsive Layout**: Flexible desktop toolbar and sidebar layouts.

## [0.1.2] - 2026-09-12

### Fixed
- **CI / CD Publishing Pipeline**: Add id-token permissions for automated release artifacts.

## [0.1.0] - 2026-09-12

### Added
- **Initial Release**: Desktop PDF redaction and page organization with Tauri v2, Rust engine, and React.
