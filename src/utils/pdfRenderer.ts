import * as pdfjsLib from 'pdfjs-dist';
// 번들된 워커 파일 URL 참조
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PageDimensions {
  width: number;       // PDF 포인트 (72 DPI 기준 가로 크기)
  height: number;      // PDF 포인트 (72 DPI 기준 세로 크기)
  canvasWidth: number; // 실제 HTML Canvas 버퍼 픽셀 너비 (DPR 적용)
  canvasHeight: number;
  viewportWidth: number; // CSS 레이아웃 픽셀 너비
  viewportHeight: number;
  scale: number;
  rotation: number;
}

export class PdfDocManager {
  private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  private currentRenderTask: pdfjsLib.RenderTask | null = null;

  async loadFromBase64(base64Data: string): Promise<number> {
    const raw = atob(base64Data);
    const uint8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      uint8Array[i] = raw.charCodeAt(i);
    }

    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    });

    this.pdfDoc = await loadingTask.promise;
    return this.pdfDoc.numPages;
  }

  async loadFromUint8Array(data: Uint8Array): Promise<number> {
    const loadingTask = pdfjsLib.getDocument({
      data,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    });

    this.pdfDoc = await loadingTask.promise;
    return this.pdfDoc.numPages;
  }

  getNumPages(): number {
    return this.pdfDoc ? this.pdfDoc.numPages : 0;
  }

  async getPageDimensions(pageNum: number, scale: number = 1.0, rotation: number = 0): Promise<PageDimensions> {
    if (!this.pdfDoc) throw new Error('PDF 문서가 로드되지 않았습니다.');
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale, rotation });
    const unscaledViewport = page.getViewport({ scale: 1.0, rotation: 0 });

    const dpr = window.devicePixelRatio || 1;

    return {
      width: unscaledViewport.width,
      height: unscaledViewport.height,
      canvasWidth: Math.floor(viewport.width * dpr),
      canvasHeight: Math.floor(viewport.height * dpr),
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      scale,
      rotation: viewport.rotation,
    };
  }

  async renderPage(
    pageNum: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.0,
    rotation: number = 0
  ): Promise<PageDimensions> {
    if (!this.pdfDoc) throw new Error('PDF 문서가 로드되지 않았습니다.');

    // 이전 렌더링 작업이 진행 중이면 취소
    if (this.currentRenderTask) {
      try {
        await this.currentRenderTask.cancel();
      } catch (_) {
        // 취소 에러 무시
      }
      this.currentRenderTask = null;
    }

    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale, rotation });
    const unscaledViewport = page.getViewport({ scale: 1.0, rotation: 0 });

    // macOS Retina 디스플레이 등 High-DPI 환경 대응을 위한 devicePixelRatio 처리
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D 캔버스 컨텍스트를 가져올 수 없습니다.');

    ctx.save();
    ctx.scale(dpr, dpr);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    this.currentRenderTask = page.render(renderContext);
    await this.currentRenderTask.promise;
    ctx.restore();

    this.currentRenderTask = null;

    return {
      width: unscaledViewport.width,
      height: unscaledViewport.height,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      scale,
      rotation: viewport.rotation,
    };
  }

  /// 페이지 썸네일을 Data URL로 신속하게 렌더링
  async renderThumbnail(pageNum: number, maxDim: number = 180, rotation: number = 0): Promise<string> {
    if (!this.pdfDoc) return '';
    const page = await this.pdfDoc.getPage(pageNum);
    const unscaled = page.getViewport({ scale: 1.0, rotation });
    const scale = Math.min(maxDim / unscaled.width, maxDim / unscaled.height);
    const viewport = page.getViewport({ scale, rotation });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  destroy() {
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
  }
}

/// 단일 파일용 일회성 썸네일 생성 헬퍼 함수
export async function generateThumbnailFromBase64(
  base64Data: string,
  pageNum: number = 1,
  maxDim: number = 180,
  rotation: number = 0
): Promise<string> {
  const manager = new PdfDocManager();
  try {
    await manager.loadFromBase64(base64Data);
    const thumb = await manager.renderThumbnail(pageNum, maxDim, rotation);
    manager.destroy();
    return thumb;
  } catch (e) {
    manager.destroy();
    return '';
  }
}
