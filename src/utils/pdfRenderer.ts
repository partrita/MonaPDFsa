import * as pdfjsLib from 'pdfjs-dist';
// Use standard bundled worker
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PageDimensions {
  width: number;       // PDF points (72 DPI)
  height: number;
  canvasWidth: number; // actual HTML canvas pixel width
  canvasHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
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

  async getPageDimensions(pageNum: number, scale: number = 1.0): Promise<PageDimensions> {
    if (!this.pdfDoc) throw new Error('PDF not loaded');
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    const dpr = window.devicePixelRatio || 1;

    return {
      width: unscaledViewport.width,
      height: unscaledViewport.height,
      canvasWidth: Math.floor(viewport.width * dpr),
      canvasHeight: Math.floor(viewport.height * dpr),
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      scale,
    };
  }

  async renderPage(
    pageNum: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.0
  ): Promise<PageDimensions> {
    if (!this.pdfDoc) throw new Error('PDF not loaded');

    // Cancel ongoing render if any
    if (this.currentRenderTask) {
      try {
        await this.currentRenderTask.cancel();
      } catch (_) {
        // Ignored
      }
      this.currentRenderTask = null;
    }

    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get canvas context');

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
    };
  }

  destroy() {
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
  }
}
