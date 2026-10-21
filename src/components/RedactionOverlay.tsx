import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RedactionItem, RedactionMode } from '../types';
import { createMosaicImageDataUrl } from '../utils/mosaicFilter';
import { Move, Trash2 } from 'lucide-react';

type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

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
  selectedRedactionId: string | null;
  onAddRedaction: (item: RedactionItem) => void;
  onUpdateRedaction: (id: string, updates: { normX?: number; normY?: number; normWidth?: number; normHeight?: number; blockSize?: number; imageData?: string }) => void;
  onRemoveRedaction: (id: string) => void;
  onSelectRedaction: (id: string | null) => void;
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
  selectedRedactionId,
  onAddRedaction,
  onUpdateRedaction,
  onRemoveRedaction,
  onSelectRedaction,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [interactionType, setInteractionType] = useState<'move' | 'resize' | null>(null);
  const [interactionDir, setInteractionDir] = useState<ResizeDir | null>(null);
  const [interactionStart, setInteractionStart] = useState<{ x: number; y: number } | null>(null);
  const [interactionOrigin, setInteractionOrigin] = useState<{ normX: number; normY: number; normWidth: number; normHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mosaicKeysRef = useRef<Record<string, string>>({});

  const isInteractive = mode === 'mosaic' || mode === 'blackout' || mode === 'whiteout';

  const getPointerPos = (e: React.PointerEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
  };

  const clampNorm = (v: number) => Math.max(0, Math.min(1, v));

  // Rebuild the mosaic crop when the box moves, resizes, or the block size changes.
  // The key guard stops the update from re-triggering this effect forever.
  useEffect(() => {
    if (!sourceCanvas || !selectedRedactionId) return;
    // Rebuild once after the drag ends. Regenerating on every pointer move is slow.
    if (interactionType) return;
    const r = redactions.find((x) => x.id === selectedRedactionId);
    if (!r || r.style !== 'mosaic') return;

    const key = `${r.normX},${r.normY},${r.normWidth},${r.normHeight},${blockSize}`;
    if (mosaicKeysRef.current[r.id] === key) return;
    mosaicKeysRef.current[r.id] = key;

    const scaleFactorX = sourceCanvas.width / viewportWidth;
    const scaleFactorY = sourceCanvas.height / viewportHeight;
    const canvasPixelX = (r.normX * viewportWidth) * scaleFactorX;
    const canvasPixelY = (r.normY * viewportHeight) * scaleFactorY;
    const canvasPixelW = (r.normWidth * viewportWidth) * scaleFactorX;
    const canvasPixelH = (r.normHeight * viewportHeight) * scaleFactorY;

    const newImageData = createMosaicImageDataUrl(
      sourceCanvas,
      canvasPixelX,
      canvasPixelY,
      canvasPixelW,
      canvasPixelH,
      blockSize * scaleFactorX
    );

    if (newImageData && newImageData !== r.imageData) {
      onUpdateRedaction(r.id, { blockSize, imageData: newImageData });
    } else if (r.blockSize !== blockSize) {
      onUpdateRedaction(r.id, { blockSize });
    }
  }, [blockSize, selectedRedactionId, sourceCanvas, viewportWidth, viewportHeight, redactions, onUpdateRedaction, interactionType]);

  const commitUpdate = useCallback((id: string, updates: { normX?: number; normY?: number; normWidth?: number; normHeight?: number; blockSize?: number; imageData?: string }) => {
    onUpdateRedaction(id, updates);
  }, [onUpdateRedaction]);

  const handleContainerPointerDown = (e: React.PointerEvent) => {
    if (!isInteractive || e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Clicking a redaction item or its resize handle selects it. Do not start a new box.
    if (target.closest('.redaction-item, .resize-handle, button')) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getPointerPos(e);
    setStartPoint(pos);
    setCurrentPoint(pos);
    setIsDrawing(true);
    onSelectRedaction(null);
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (isDrawing && startPoint) {
      setCurrentPoint(getPointerPos(e));
    }

    if (interactionType === 'move' && activeId && interactionStart && interactionOrigin) {
      const pos = getPointerPos(e);
      const dx = pos.x - interactionStart.x;
      const dy = pos.y - interactionStart.y;
      const r = redactions.find((x) => x.id === activeId);
      if (!r) return;
      const newNormX = clampNorm(interactionOrigin.normX + dx / viewportWidth);
      const newNormY = clampNorm(interactionOrigin.normY + dy / viewportHeight);
      commitUpdate(activeId, {
        normX: Math.min(newNormX, 1 - r.normWidth),
        normY: Math.min(newNormY, 1 - r.normHeight),
      });
    }

    if (interactionType === 'resize' && activeId && interactionStart && interactionOrigin && interactionDir) {
      const pos = getPointerPos(e);
      const dx = pos.x - interactionStart.x;
      const dy = pos.y - interactionStart.y;
      const r = redactions.find((x) => x.id === activeId);
      if (!r) return;

      let { normX, normY, normWidth, normHeight } = interactionOrigin;
      const dX = dx / viewportWidth;
      const dY = dy / viewportHeight;

      switch (interactionDir) {
        case 'e':
          normWidth = clampNorm(normWidth + dX);
          break;
        case 'w':
          normX = clampNorm(interactionOrigin.normX + dX);
          normWidth = Math.max(interactionOrigin.normWidth + (interactionOrigin.normX - normX), 0.02);
          break;
        case 's':
          normHeight = clampNorm(normHeight + dY);
          break;
        case 'n':
          normY = clampNorm(interactionOrigin.normY + dY);
          normHeight = Math.max(interactionOrigin.normHeight + (interactionOrigin.normY - normY), 0.02);
          break;
        case 'se':
          normWidth = clampNorm(normWidth + dX);
          normHeight = clampNorm(normHeight + dY);
          break;
        case 'sw':
          normX = clampNorm(interactionOrigin.normX + dX);
          normWidth = Math.max(interactionOrigin.normWidth + (interactionOrigin.normX - normX), 0.02);
          normHeight = clampNorm(normHeight + dY);
          break;
        case 'ne':
          normWidth = clampNorm(normWidth + dX);
          normY = clampNorm(interactionOrigin.normY + dY);
          normHeight = Math.max(interactionOrigin.normHeight + (interactionOrigin.normY - normY), 0.02);
          break;
        case 'nw':
          normX = clampNorm(interactionOrigin.normX + dX);
          normWidth = Math.max(interactionOrigin.normWidth + (interactionOrigin.normX - normX), 0.02);
          normY = clampNorm(interactionOrigin.normY + dY);
          normHeight = Math.max(interactionOrigin.normHeight + (interactionOrigin.normY - normY), 0.02);
          break;
      }
      normWidth = Math.max(normWidth, 0.02);
      normHeight = Math.max(normHeight, 0.02);
      commitUpdate(activeId, { normX, normY, normWidth, normHeight });
    }
  };

  const handleContainerPointerUp = () => {
    if (isDrawing && startPoint && currentPoint && sourceCanvas) {
      const x = Math.min(startPoint.x, currentPoint.x);
      const y = Math.min(startPoint.y, currentPoint.y);
      const width = Math.abs(currentPoint.x - startPoint.x);
      const height = Math.abs(currentPoint.y - startPoint.y);

      // Ignore accidental tiny clicks (under 6px)
      if (width >= 6 && height >= 6 && viewportWidth > 0 && viewportHeight > 0) {
        const normX = x / viewportWidth;
        const normY = y / viewportHeight;
        const normWidth = width / viewportWidth;
        const normHeight = height / viewportHeight;

        // PDF coordinates use a bottom-left origin in points.
        const pdfX = normX * pageWidthPoints;
        const pdfWidth = normWidth * pageWidthPoints;
        const pdfHeight = normHeight * pageHeightPoints;
        const pdfY = pageHeightPoints - (normY + normHeight) * pageHeightPoints;

        // Correct for High-DPI canvas scaling (macOS Retina, etc.)
        let imageData: string | undefined = undefined;
        if (mode === 'mosaic') {
          const scaleFactorX = sourceCanvas.width / viewportWidth;
          const scaleFactorY = sourceCanvas.height / viewportHeight;
          imageData = createMosaicImageDataUrl(
            sourceCanvas,
            x * scaleFactorX,
            y * scaleFactorY,
            width * scaleFactorX,
            height * scaleFactorY,
            blockSize * scaleFactorX
          );
        }

        onAddRedaction({
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
        });
      }
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    setActiveId(null);
    setInteractionType(null);
    setInteractionDir(null);
    setInteractionStart(null);
    setInteractionOrigin(null);
  };

  const handleItemPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (!isInteractive || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelectRedaction(id);
    setActiveId(id);
    setInteractionType('move');
    setInteractionStart(getPointerPos(e));
    const r = redactions.find((x) => x.id === id);
    if (r) {
      setInteractionOrigin({ normX: r.normX, normY: r.normY, normWidth: r.normWidth, normHeight: r.normHeight });
    }
  };

  const handleHandlePointerDown = (e: React.PointerEvent, id: string, dir: ResizeDir) => {
    e.stopPropagation();
    if (!isInteractive || e.button !== 0) return;
    const r = redactions.find((x) => x.id === id);
    if (!r) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelectRedaction(id);
    setActiveId(id);
    setInteractionType('resize');
    setInteractionDir(dir);
    setInteractionStart(getPointerPos(e));
    setInteractionOrigin({ normX: r.normX, normY: r.normY, normWidth: r.normWidth, normHeight: r.normHeight });
  };

  // New-box preview while dragging on empty space.
  const dragRect = isDrawing && startPoint && currentPoint ? {
    x: Math.min(startPoint.x, currentPoint.x),
    y: Math.min(startPoint.y, currentPoint.y),
    width: Math.abs(currentPoint.x - startPoint.x),
    height: Math.abs(currentPoint.y - startPoint.y),
  } : null;

  const isSelected = (id: string) => selectedRedactionId === id;

  return (
    <div
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onPointerCancel={handleContainerPointerUp}
      style={{
        width: `${viewportWidth}px`,
        height: `${viewportHeight}px`,
        touchAction: isInteractive ? 'none' : 'auto',
      }}
      className={`absolute inset-0 pointer-events-auto ${isInteractive ? 'cursor-crosshair' : 'cursor-default'
        }`}
    >
      {/* Redaction boxes for the current page */}
      {redactions.map((r) => {
        const left = r.normX * viewportWidth;
        const top = r.normY * viewportHeight;
        const width = r.normWidth * viewportWidth;
        const height = r.normHeight * viewportHeight;
        const selected = isSelected(r.id);
        const moving = interactionType === 'move' && activeId === r.id;
        const styleName = r.style === 'mosaic' ? '모자이크' : r.style === 'blackout' ? '블랙아웃' : '화이트아웃';

        return (
          <div
            key={r.id}
            className={`absolute z-10 select-none shadow-sm redaction-item group transition-shadow ${
              selected
                ? 'ring-2 ring-sky-500 ring-offset-1 bg-sky-500/10'
                : isInteractive
                  ? 'hover:ring-1 hover:ring-sky-400 hover:shadow-md'
                  : ''
            } ${
              isInteractive
                ? moving
                  ? 'cursor-grabbing'
                  : 'cursor-move'
                : 'cursor-default'
            }`}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
            }}
            title={`${styleName}: 끌어서 이동, 모서리를 끌어 크기 조절`}
            onPointerDown={(e) => handleItemPointerDown(e, r.id)}
          >
            {/* Redaction content */}
            {r.style === 'mosaic' && r.imageData ? (
              <img
                src={r.imageData}
                alt="Mosaic"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="w-full h-full object-fill rounded-[1px]"
              />
            ) : r.style === 'whiteout' ? (
              <div className="w-full h-full bg-white border border-gray-300/80 rounded-[1px]" />
            ) : (
              <div className="w-full h-full bg-black border border-gray-900 rounded-[1px]" />
            )}

            {/* 8-direction resize handles */}
            {selected && [
              { dir: 'nw' as ResizeDir, top: '-6px', left: '-6px', cursor: 'nw-resize' },
              { dir: 'n' as ResizeDir, top: '-6px', left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
              { dir: 'ne' as ResizeDir, top: '-6px', right: '-6px', cursor: 'ne-resize' },
              { dir: 'w' as ResizeDir, top: '50%', left: '-6px', transform: 'translateY(-50%)', cursor: 'w-resize' },
              { dir: 'e' as ResizeDir, top: '50%', right: '-6px', transform: 'translateY(-50%)', cursor: 'e-resize' },
              { dir: 'sw' as ResizeDir, bottom: '-6px', left: '-6px', cursor: 'sw-resize' },
              { dir: 's' as ResizeDir, bottom: '-6px', left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
              { dir: 'se' as ResizeDir, bottom: '-6px', right: '-6px', cursor: 'se-resize' },
            ].map((h) => (
              <div
                key={h.dir}
                className="resize-handle absolute z-50"
                style={{
                  top: h.top,
                  left: h.left,
                  right: h.right,
                  bottom: h.bottom,
                  transform: h.transform,
                  width: '12px',
                  height: '12px',
                  background: '#ffffff',
                  border: '1px solid #3b82f6',
                  borderRadius: '2px',
                  cursor: h.cursor,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
                onPointerDown={(e) => handleHandlePointerDown(e, r.id, h.dir)}
              />
            ))}

            {/* Move hint, label, and delete button on hover */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 right-0 flex items-center gap-1 bg-gray-900/90 text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg z-20 pointer-events-auto cursor-move">
              <Move className="w-3 h-3 text-sky-300" />
              <span className="font-semibold capitalize">{styleName}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveRedaction(r.id);
                }}
                className="hover:text-red-400 p-0.5 rounded cursor-pointer"
                title="가림 삭제"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}

      {/* New-box preview while dragging */}
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
