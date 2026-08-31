import React, { useState, useRef } from 'react';
import { RedactionItem, RedactionMode } from '../types';
import { createMosaicImageDataUrl } from '../utils/mosaicFilter';
import { Trash2 } from 'lucide-react';

interface RedactionOverlayProps {
  page: number;
  viewportWidth: number;
  viewportHeight: number;
  pageWidthPoints: number;
  pageHeightPoints: number;
  sourceCanvas: HTMLCanvasElement | null;
  mode: RedactionMode;
  blockSize: number;
  redactions: RedactionItem[];
  onAddRedaction: (item: RedactionItem) => void;
  onRemoveRedaction: (id: string) => void;
}

export const RedactionOverlay: React.FC<RedactionOverlayProps> = ({
  page,
  viewportWidth,
  viewportHeight,
  pageWidthPoints,
  pageHeightPoints,
  sourceCanvas,
  mode,
  blockSize,
  redactions,
  onAddRedaction,
  onRemoveRedaction,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isInteractive = mode === 'mosaic' || mode === 'blackout' || mode === 'whiteout';

  const getPointerPos = (e: React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isInteractive || e.button !== 0) return;
    const pos = getPointerPos(e);
    setStartPoint(pos);
    setCurrentPoint(pos);
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startPoint) return;
    setCurrentPoint(getPointerPos(e));
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPoint || !currentPoint || !sourceCanvas) {
      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);

    // 미세한 의도치 않은 클릭(6px 미만) 필터링
    if (width >= 6 && height >= 6 && viewportWidth > 0 && viewportHeight > 0) {
      const normX = x / viewportWidth;
      const normY = y / viewportHeight;
      const normWidth = width / viewportWidth;
      const normHeight = height / viewportHeight;

      // PDF 좌표계 변환 (좌하단 원점 0,0 기준 72 DPI 포인트)
      const pdfX = normX * pageWidthPoints;
      const pdfWidth = normWidth * pageWidthPoints;
      const pdfHeight = normHeight * pageHeightPoints;
      const pdfY = pageHeightPoints - (normY + normHeight) * pageHeightPoints;

      // macOS Retina / High-DPI 디스플레이 정확한 픽셀 배율 보정
      let imageData: string | undefined = undefined;
      if (mode === 'mosaic') {
        const scaleFactorX = sourceCanvas.width / viewportWidth;
        const scaleFactorY = sourceCanvas.height / viewportHeight;
        const canvasPixelX = x * scaleFactorX;
        const canvasPixelY = y * scaleFactorY;
        const canvasPixelW = width * scaleFactorX;
        const canvasPixelH = height * scaleFactorY;

        imageData = createMosaicImageDataUrl(
          sourceCanvas,
          canvasPixelX,
          canvasPixelY,
          canvasPixelW,
          canvasPixelH,
          blockSize * scaleFactorX
        );
      }

      const newRedaction: RedactionItem = {
        id: `redact_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        page,
        pdfX,
        pdfY,
        pdfWidth,
        pdfHeight,
        normX,
        normY,
        normWidth,
        normHeight,
        style: mode as 'mosaic' | 'blackout' | 'whiteout',
        blockSize,
        imageData,
      };

      onAddRedaction(newRedaction);
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  };

  // 드래그 중인 활성 사각형 계산
  const dragRect = isDrawing && startPoint && currentPoint ? {
    x: Math.min(startPoint.x, currentPoint.x),
    y: Math.min(startPoint.y, currentPoint.y),
    width: Math.abs(currentPoint.x - startPoint.x),
    height: Math.abs(currentPoint.y - startPoint.y),
  } : null;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ width: `${viewportWidth}px`, height: `${viewportHeight}px` }}
      className={`absolute inset-0 pointer-events-auto ${isInteractive ? 'cursor-crosshair' : 'cursor-default'
        }`}
    >
      {/* 현재 페이지의 가림 처리 영역 렌더링 */}
      {redactions.map((r) => {
        const left = r.normX * viewportWidth;
        const top = r.normY * viewportHeight;
        const width = r.normWidth * viewportWidth;
        const height = r.normHeight * viewportHeight;

        return (
          <div
            key={r.id}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
            }}
            className="absolute group z-10 select-none shadow-sm transition-all"
          >
            {/* 가림 오버레이 내용 */}
            {r.style === 'mosaic' && r.imageData ? (
              <img
                src={r.imageData}
                alt="Mosaic"
                className="w-full h-full object-fill rounded-[1px] border border-sky-400/50"
              />
            ) : r.style === 'whiteout' ? (
              <div className="w-full h-full bg-white border border-gray-300/80 rounded-[1px]" />
            ) : (
              <div className="w-full h-full bg-black border border-gray-900 rounded-[1px]" />
            )}

            {/* 마우스 호버 시 가림 레이블 및 삭제 버튼 */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 right-0 flex items-center gap-1 bg-gray-900/90 text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg z-20 pointer-events-auto">
              <span className="font-semibold capitalize">
                {r.style === 'mosaic' ? '모자이크' : r.style === 'blackout' ? '블랙아웃' : '화이트아웃'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveRedaction(r.id);
                }}
                className="hover:text-red-400 p-0.5 rounded"
                title="가림 삭제"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}

      {/* 마우스 드래그 중인 선택 사각형 */}
      {dragRect && dragRect.width > 2 && dragRect.height > 2 && (
        <div
          style={{
            left: `${dragRect.x}px`,
            top: `${dragRect.y}px`,
            width: `${dragRect.width}px`,
            height: `${dragRect.height}px`,
          }}
          className="absolute border-2 border-sky-500 border-dashed bg-sky-400/20 pointer-events-none z-20 animate-pulse"
        >
          <div className="absolute -top-5 left-0 bg-sky-600 text-white text-[9px] font-bold px-1 rounded shadow">
            {mode === 'mosaic' ? '모자이크 영역 선택 중' : '가림 영역 선택 중'}
          </div>
        </div>
      )}
    </div>
  );
};
