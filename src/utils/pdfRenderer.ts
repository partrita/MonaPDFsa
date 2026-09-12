import * as pdfjsLib from 'pdfjs-dist';
// 번들된 워커 파일 URL 참조
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { applyMosaicToCanvas } from './mosaicFilter';

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
  private renderSeq = 0;

  // ponytail: chunked atob still copies once; direct binary read via plugin-fs if load stalls
  private static base64ToBytes(b64: string): Uint8Array {
    const comma = b64.indexOf(',');
    const clean = comma >= 0 ? b64.slice(comma + 1) : b64;
    const bin = atob(clean);
    const len = bin.length;
    const out = new Uint8Array(len);
    const CHUNK = 0x8000;
    for (let i = 0; i < len; i += CHUNK) {
      const n = Math.min(CHUNK, len - i);
      for (let j = 0; j < n; j++) out[i + j] = bin.charCodeAt(i + j);
    }
    return out;
  }

  async loadFromBase64(base64Data: string): Promise<number> {
    const uint8Array = PdfDocManager.base64ToBytes(base64Data);

    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      cMapUrl: 'cmaps/',
      cMapPacked: true,
    });

    this.pdfDoc = await loadingTask.promise;
    return this.pdfDoc.numPages;
  }

  async loadFromUint8Array(data: Uint8Array): Promise<number> {
    const loadingTask = pdfjsLib.getDocument({
      data,
      cMapUrl: 'cmaps/',
      cMapPacked: true,
    });

    this.pdfDoc = await loadingTask.promise;
    return this.pdfDoc.numPages;
  }

  getNumPages(): number {
    return this.pdfDoc ? this.pdfDoc.numPages : 0;
  }

  async renderPage(
    pageNum: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.0,
    rotation: number = 0
  ): Promise<PageDimensions> {
    if (!this.pdfDoc) throw new Error('PDF 문서가 로드되지 않았습니다.');

    // Cancel prior render without await; stale results are dropped via seq
    const seq = ++this.renderSeq;
    if (this.currentRenderTask) {
      try {
        this.currentRenderTask.cancel();
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

    const task = page.render(renderContext);
    this.currentRenderTask = task;
    try {
      await task.promise;
    } finally {
      ctx.restore();
      if (this.currentRenderTask === task) this.currentRenderTask = null;
    }
    if (seq !== this.renderSeq) throw { name: 'RenderingCancelledException' };

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

  /// 페이지 썸네일을 Data URL로 신속하게 렌더링하고 리소스를 즉시 해제
  async renderThumbnail(pageNum: number, maxDim: number = 180, rotation: number = 0): Promise<string> {
    if (!this.pdfDoc) return '';
    try {
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
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      return dataUrl;
    } catch (_) {
      return '';
    }
  }

  /**
   * 가림 처리(모자이크, 블랙아웃, 화이트아웃)가 적용된 페이지를 고해상도로 래스터라이즈(Flattening)하여
   * 기저 텍스트/어노테이션이 완전히 픽셀화된 JPEG 이미지 데이터를 생성합니다.
   */
  async renderFlattenedRedactedPage(
    pageNum: number,
    pageRedactions: any[],
    scale: number = 2.0
  ): Promise<{ imageData: string; widthPts: number; heightPts: number }> {
    if (!this.pdfDoc) throw new Error('PDF 문서가 로드되지 않았습니다.');
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('캔버스 2D 컨텍스트를 생성할 수 없습니다.');

    // 1. PDF 원본 벡터 페이지를 고해상도로 렌더링
    await page.render({ canvasContext: ctx, viewport }).promise;

    // 2. 가림 영역을 캔버스 픽셀에 직접 굽기 (Bake / Flattening)
    for (const r of pageRedactions) {
      const rx = r.normX * canvas.width;
      const ry = r.normY * canvas.height;
      const rw = r.normWidth * canvas.width;
      const rh = r.normHeight * canvas.height;

      if (r.style === 'blackout') {
        ctx.fillStyle = '#000000';
        ctx.fillRect(rx, ry, rw, rh);
      } else if (r.style === 'whiteout') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(rx, ry, rw, rh);
      } else if (r.style === 'mosaic') {
        applyMosaicToCanvas(ctx, rx, ry, rw, rh, (r.blockSize || 14) * scale);
      }
    }

    // 3. 고품질 JPEG Data URL 추출 (PDF Image XObject로 즉시 패키징)
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;

    return {
      imageData,
      widthPts: unscaledViewport.width,
      heightPts: unscaledViewport.height,
    };
  }

  destroy() {
    this.renderSeq++;
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

/// 다중 페이지 배치 썸네일 생성 헬퍼 함수 (단일 Document 로드 + 점진적 청크 스트리밍)
export async function generateThumbnailsBatch(
  base64Data: string,
  pageNumbers: number[],
  maxDim: number = 180,
  rotation: number = 0,
  onChunkReady?: (chunk: Map<number, string>) => void,
  isCancelled?: () => boolean
): Promise<Map<number, string>> {
  const manager = new PdfDocManager();
  const results = new Map<number, string>();
  try {
    await manager.loadFromBase64(base64Data);
    let currentChunk = new Map<number, string>();

    for (let i = 0; i < pageNumbers.length; i++) {
      if (isCancelled?.()) break;
      const pageNum = pageNumbers[i];
      const thumb = await manager.renderThumbnail(pageNum, maxDim, rotation);
      results.set(pageNum, thumb);
      currentChunk.set(pageNum, thumb);

      if ((i + 1) % 10 === 0 || i === pageNumbers.length - 1) {
        if (onChunkReady) {
          onChunkReady(new Map(currentChunk));
          currentChunk.clear();
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } catch (e) {
    console.error('Batch thumbnail error:', e);
  } finally {
    manager.destroy();
  }
  return results;
}
