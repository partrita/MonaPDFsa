function clampRect(
  canvasW: number,
  canvasH: number,
  x: number,
  y: number,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } | null {
  const cx = Math.max(0, Math.floor(x));
  const cy = Math.max(0, Math.floor(y));
  const cw = Math.min(canvasW - cx, Math.ceil(w));
  const ch = Math.min(canvasH - cy, Math.ceil(h));
  if (cw <= 0 || ch <= 0) return null;
  return { x: cx, y: cy, w: cw, h: ch };
}

/**
 * 지정된 캔버스 영역에 모자이크(픽셀 블록화) 필터를 직접 적용하여 픽셀을 변환합니다.
 */
export function applyMosaicToCanvas(
  ctx: CanvasRenderingContext2D,
  pixelX: number,
  pixelY: number,
  pixelW: number,
  pixelH: number,
  blockSize: number = 14
): void {
  const r = clampRect(ctx.canvas.width, ctx.canvas.height, pixelX, pixelY, pixelW, pixelH);
  if (!r) return;

  // Downscale then upscale with smoothing off: GPU does the averaging
  const bs = Math.max(2, Math.floor(blockSize));
  const tw = Math.max(1, Math.round(r.w / bs));
  const th = Math.max(1, Math.round(r.h / bs));
  const tiny = document.createElement('canvas');
  tiny.width = tw;
  tiny.height = th;
  const tctx = tiny.getContext('2d');
  if (!tctx) return;
  tctx.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, tw, th);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, tw, th, r.x, r.y, r.w, r.h);
  ctx.restore();
}

/**
 * Extracts pixels from the source canvas at the specified rectangle,
 * applies a block-pixelation mosaic effect, and returns the result as a PNG Data URL.
 */
export function createMosaicImageDataUrl(
  sourceCanvas: HTMLCanvasElement,
  pixelX: number,
  pixelY: number,
  pixelW: number,
  pixelH: number,
  blockSize: number = 14
): string {
  const r = clampRect(sourceCanvas.width, sourceCanvas.height, pixelX, pixelY, pixelW, pixelH);
  if (!r) return '';

  const bs = Math.max(2, Math.floor(blockSize));
  const tw = Math.max(1, Math.round(r.w / bs));
  const th = Math.max(1, Math.round(r.h / bs));

  // Draw into an offscreen canvas via downscale trick
  const tiny = document.createElement('canvas');
  tiny.width = tw;
  tiny.height = th;
  const tinyCtx = tiny.getContext('2d');
  if (!tinyCtx) return '';
  tinyCtx.drawImage(sourceCanvas, r.x, r.y, r.w, r.h, 0, 0, tw, th);

  const offscreen = document.createElement('canvas');
  offscreen.width = r.w;
  offscreen.height = r.h;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return '';
  offCtx.imageSmoothingEnabled = false;
  offCtx.drawImage(tiny, 0, 0, tw, th, 0, 0, r.w, r.h);
  return offscreen.toDataURL('image/png');
}

/**
 * Format bytes to readable size
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
