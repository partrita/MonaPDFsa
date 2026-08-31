import { RedactionItem } from '../types';

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
  const clampX = Math.max(0, Math.floor(pixelX));
  const clampY = Math.max(0, Math.floor(pixelY));
  const clampW = Math.min(ctx.canvas.width - clampX, Math.ceil(pixelW));
  const clampH = Math.min(ctx.canvas.height - clampY, Math.ceil(pixelH));

  if (clampW <= 0 || clampH <= 0) return;

  const imageData = ctx.getImageData(clampX, clampY, clampW, clampH);
  const data = imageData.data;
  const bs = Math.max(2, Math.floor(blockSize));

  // 블록 단위로 순회하며 평균 색상 계산 및 적용
  for (let by = 0; by < clampH; by += bs) {
    for (let bx = 0; bx < clampW; bx += bs) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let count = 0;

      const bh = Math.min(bs, clampH - by);
      const bw = Math.min(bs, clampW - bx);

      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((by + dy) * clampW + (bx + dx)) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          aSum += data[idx + 3];
          count++;
        }
      }

      const avgR = Math.round(rSum / count);
      const avgG = Math.round(gSum / count);
      const avgB = Math.round(bSum / count);
      const avgA = Math.round(aSum / count);

      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((by + dy) * clampW + (bx + dx)) * 4;
          data[idx] = avgR;
          data[idx + 1] = avgG;
          data[idx + 2] = avgB;
          data[idx + 3] = avgA;
        }
      }
    }
  }

  ctx.putImageData(imageData, clampX, clampY);
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
  const clampX = Math.max(0, Math.floor(pixelX));
  const clampY = Math.max(0, Math.floor(pixelY));
  const clampW = Math.min(sourceCanvas.width - clampX, Math.ceil(pixelW));
  const clampH = Math.min(sourceCanvas.height - clampY, Math.ceil(pixelH));

  if (clampW <= 0 || clampH <= 0) {
    return '';
  }

  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return '';

  const imageData = srcCtx.getImageData(clampX, clampY, clampW, clampH);
  const data = imageData.data;

  const bs = Math.max(2, Math.floor(blockSize));

  // Loop over blocks
  for (let by = 0; by < clampH; by += bs) {
    for (let bx = 0; bx < clampW; bx += bs) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let count = 0;

      const bh = Math.min(bs, clampH - by);
      const bw = Math.min(bs, clampW - bx);

      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((by + dy) * clampW + (bx + dx)) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          aSum += data[idx + 3];
          count++;
        }
      }

      const avgR = Math.round(rSum / count);
      const avgG = Math.round(gSum / count);
      const avgB = Math.round(bSum / count);
      const avgA = Math.round(aSum / count);

      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((by + dy) * clampW + (bx + dx)) * 4;
          data[idx] = avgR;
          data[idx + 1] = avgG;
          data[idx + 2] = avgB;
          data[idx + 3] = avgA;
        }
      }
    }
  }

  // Draw into an offscreen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = clampW;
  offscreen.height = clampH;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return '';

  offCtx.putImageData(imageData, 0, 0);
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
