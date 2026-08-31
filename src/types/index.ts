export type RedactionMode = 'hand' | 'mosaic' | 'blackout' | 'whiteout';

export interface RedactionItem {
  id: string;
  page: number; // 1부터 시작하는 페이지 번호
  // PDF 표준 포인트 좌표 (좌하단 원점 0,0 기준)
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  // 화면 렌더링용 정규화 좌표 (0.0 ~ 1.0)
  normX: number;
  normY: number;
  normWidth: number;
  normHeight: number;
  style: 'mosaic' | 'blackout' | 'whiteout';
  blockSize: number;
  imageData?: string; // 모자이크 PNG Base64 Data URL
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

/// 통합 페이지 관리(Page Studio)의 개별 페이지 카드 모델
export interface PageStudioItem {
  id: string;
  sourceFilePath: string;
  sourceFileName: string;
  sourcePageIndex: number; // 1부터 시작하는 원본 페이지 번호
  rotation: number; // 0, 90, 180, 270 (시계방향 각도)
  thumbnailUrl?: string;
  isSplitBreak?: boolean; // 해당 페이지 바로 뒤에서 분할할지 여부
}
