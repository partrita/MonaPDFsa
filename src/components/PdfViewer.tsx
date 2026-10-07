import React, { useEffect, useRef, useState } from 'react';
import { PdfDocManager, PageDimensions } from '../utils/pdfRenderer';
import { RedactionOverlay } from './RedactionOverlay';
import { RedactionItem, RedactionMode } from '../types';
import { Loader2, FileUp } from 'lucide-react';

interface PdfViewerProps {
  docManager: PdfDocManager | null;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  scale: number;
  mode: RedactionMode;
  blockSize: number;
  redactions: RedactionItem[];
  onAddRedaction: (item: RedactionItem) => void;
  onRemoveRedaction: (id: string) => void;
  onOpenFile: () => void;
  hasDocument: boolean;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  docManager,
  currentPage,
  totalPages,
  onPageChange,
  scale,
  mode,
  blockSize,
  redactions,
  onAddRedaction,
  onRemoveRedaction,
  onOpenFile,
  hasDocument,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<PageDimensions | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const lastPageTurnTimeRef = useRef(0);

  // Panning state for Hand tool
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Mouse wheel scroll page transition handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasDocument) return;

    const handleWheel = (e: WheelEvent) => {
      // Allow browser zoom when user presses Ctrl or Cmd
      if (e.ctrlKey || e.metaKey) return;

      const now = Date.now();
      // Throttle page transitions to prevent accidental multi-page skips
      if (now - lastPageTurnTimeRef.current < 300) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 6;
      const isAtTop = scrollTop <= 6;
      const fitsInContainer = scrollHeight <= clientHeight + 10;

      // Scroll Down -> Next Page
      if (e.deltaY > 15) {
        if ((fitsInContainer || isAtBottom) && currentPage < totalPages) {
          e.preventDefault();
          lastPageTurnTimeRef.current = now;
          onPageChange(currentPage + 1);
          setTimeout(() => {
            if (containerRef.current) containerRef.current.scrollTop = 0;
          }, 0);
        }
      }
      // Scroll Up -> Previous Page
      else if (e.deltaY < -15) {
        if ((fitsInContainer || isAtTop) && currentPage > 1) {
          e.preventDefault();
          lastPageTurnTimeRef.current = now;
          onPageChange(currentPage - 1);
          setTimeout(() => {
            if (containerRef.current) {
              containerRef.current.scrollTop =
                containerRef.current.scrollHeight - containerRef.current.clientHeight;
            }
          }, 0);
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [currentPage, totalPages, onPageChange, hasDocument]);


  // Render current page when page, scale, or docManager changes
  useEffect(() => {
    let active = true;

    async function doRender() {
      if (!docManager || !canvasRef.current || !hasDocument) return;
      setIsRendering(true);

      try {
        const dim = await docManager.renderPage(currentPage, canvasRef.current, scale);
        if (active) {
          setDimensions(dim);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Render error:', err);
        }
      } finally {
        if (active) {
          setIsRendering(false);
        }
      }
    }

    doRender();

    return () => {
      active = false;
      if (docManager) {
        docManager.cancelCurrentRender();
      }
    };
  }, [docManager, currentPage, scale, hasDocument]);


  // Hand tool pan handlers
  const handlePanMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'hand' || !containerRef.current) return;
    setIsPanning(true);
    setPanStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    });
  };

  const handlePanMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !panStart || !containerRef.current) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    containerRef.current.scrollLeft = panStart.scrollLeft - dx;
    containerRef.current.scrollTop = panStart.scrollTop - dy;
  };

  const handlePanMouseUp = () => {
    setIsPanning(false);
    setPanStart(null);
  };

  if (!hasDocument) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-gray-900 select-none">
        <div className="max-w-md w-full p-8 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 backdrop-blur flex flex-col items-center gap-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-pine-50 dark:bg-pine-950/60 text-pine-600 dark:text-pine-400 flex items-center justify-center shadow-inner">
            <FileUp className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">열린 PDF 문서가 없습니다</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              PDF 파일을 선택하여 모자이크/가림 기능을 사용해보세요.
            </p>
          </div>
          <button
            onClick={onOpenFile}
            className="px-5 py-2.5 rounded-xl bg-pine-600 hover:bg-pine-700 text-white font-semibold text-xs shadow-md shadow-pine-600/25 transition active:scale-95"
          >
            PDF 열기
          </button>
        </div>
      </div>
    );
  }

  const pageRedactions = redactions.filter((r) => r.page === currentPage);

  return (
    <div
      ref={containerRef}
      onMouseDown={handlePanMouseDown}
      onMouseMove={handlePanMouseMove}
      onMouseUp={handlePanMouseUp}
      onMouseLeave={handlePanMouseUp}
      className={`flex-1 overflow-auto bg-gray-200/70 dark:bg-gray-950 p-6 flex justify-center items-start ${
        mode === 'hand' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''
      }`}
    >
      <div className="relative shadow-2xl shadow-black/20 rounded-sm bg-white shrink-0">
        {/* PDF Rendering Canvas */}
        <canvas ref={canvasRef} className="block rounded-sm" />

        {/* Interactive Overlay Layer */}
        {dimensions && (
          <RedactionOverlay
            page={currentPage}
            viewportWidth={dimensions.viewportWidth}
            viewportHeight={dimensions.viewportHeight}
            pageWidthPoints={dimensions.width}
            pageHeightPoints={dimensions.height}
            sourceCanvas={canvasRef.current}
            mode={mode}
            blockSize={blockSize}
            redactions={pageRedactions}
            onAddRedaction={onAddRedaction}
            onRemoveRedaction={onRemoveRedaction}
          />
        )}

        {/* Rendering Indicator */}
        {isRendering && (
          <div className="absolute inset-0 bg-white/40 dark:bg-black/30 backdrop-blur-[1px] flex items-center justify-center pointer-events-none rounded-sm">
            <div className="flex items-center gap-2 bg-gray-900/80 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>페이지 로딩 중...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
