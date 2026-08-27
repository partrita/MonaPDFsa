export type RedactionMode = 'hand' | 'mosaic' | 'blackout' | 'whiteout';

export interface RedactionItem {
  id: string;
  page: number; // 1-based
  // Coordinates in PDF points (origin at bottom-left for PDF standard)
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  // Normalized coordinates (0 to 1) relative to page for responsive rendering
  normX: number;
  normY: number;
  normWidth: number;
  normHeight: number;
  style: 'mosaic' | 'blackout' | 'whiteout';
  blockSize: number;
  imageData?: string; // base64 PNG data URL
}

export interface LoadedPdf {
  filePath: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  base64Data: string;
}

export interface MergeItem {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  pageCount?: number;
}
