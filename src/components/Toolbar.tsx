import React from 'react';
import {
  FolderOpen,
  Save,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Hand,
  Grid,
  Square,
  PanelRight,
  Sparkles,
  Gauge,
} from 'lucide-react';
import { RedactionMode } from '../types';

interface ToolbarProps {
  onOpenFile: () => void;
  onSaveFile: () => void;
  onCompressFile: () => void;
  onCloseFile?: () => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  mode: RedactionMode;
  onModeChange: (mode: RedactionMode) => void;
  blockSize: number;
  onBlockSizeChange: (size: number) => void;
  redactionsCount: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  isSaving: boolean;
  hasDocument: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onOpenFile,
  onSaveFile,
  onCompressFile,
  onCloseFile,
  currentPage,
  totalPages,
  onPageChange,
  scale,
  onScaleChange,
  onFitWidth,
  onFitPage,
  mode,
  onModeChange,
  blockSize,
  onBlockSizeChange,
  redactionsCount,
  sidebarOpen,
  onToggleSidebar,
  isSaving,
  hasDocument,
}) => {
  return (
    <div className="h-[52px] bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 flex items-center justify-between gap-2 overflow-x-auto text-xs shrink-0 select-none shadow-sm">
      {/* File Operations */}
      <div className="flex items-center gap-2 shrink-0">
        {/*<button
          onClick={onOpenFile}
          className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium shadow-sm shadow-sky-600/20 transition active:scale-95 shrink-0 whitespace-nowrap"
          title="새로운 PDF 열기"
        >
          <FolderOpen className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">PDF 열기</span>
        </button>*/}

        <button
          onClick={onSaveFile}
          disabled={!hasDocument || isSaving}
          className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg font-medium transition active:scale-95 shrink-0 whitespace-nowrap ${
            hasDocument && !isSaving
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
          title="모자이크/가림 처리를 적용하여 새 PDF로 저장 (Cmd+S)"
        >
          <Save className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">{isSaving ? '저장 중...' : '가림 적용 저장'}</span>
          {redactionsCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 bg-white/20 rounded-full text-[10px] font-bold shrink-0">
              {redactionsCount}
            </span>
          )}
        </button>

        {hasDocument && onCloseFile && (
          <button
            onClick={onCloseFile}
            className="flex items-center gap-1.5 px-2.5 md:px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-red-50 dark:bg-gray-800 dark:hover:bg-red-950/40 text-gray-600 hover:text-red-600 dark:text-gray-300 dark:hover:text-red-400 font-medium border border-gray-200 dark:border-gray-700 transition active:scale-95 shrink-0 whitespace-nowrap"
            title="현재 열린 문서를 닫고 초기화"
          >
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="hidden md:inline">문서 닫기</span>
          </button>
        )}

        <button
          onClick={onCompressFile}
          disabled={!hasDocument}
          className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg font-medium transition active:scale-95 shrink-0 whitespace-nowrap ${
            hasDocument
              ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-600/20'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
          title="PDF 이미지 압축으로 용량 최적화"
        >
          <Gauge className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">용량 최적화</span>
        </button>
      </div>

      <div className="h-5 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1" />

      {/* Page Navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasDocument || currentPage <= 1}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent"
          title="이전 페이지"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1 px-1 text-gray-600 dark:text-gray-300 font-medium">
          <input
            type="number"
            min={1}
            max={totalPages || 1}
            value={totalPages ? currentPage : 0}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) onPageChange(val);
            }}
            disabled={!hasDocument}
            className="w-12 text-center py-1 px-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <span>/ {totalPages || 0}</span>
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasDocument || currentPage >= totalPages}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent"
          title="다음 페이지"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="h-5 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onScaleChange(Math.max(0.3, scale - 0.15))}
          disabled={!hasDocument}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-30"
          title="축소"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={() => onScaleChange(1.0)}
          disabled={!hasDocument}
          className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold min-w-[3.5rem] text-center"
          title="100% 배율"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          onClick={() => onScaleChange(Math.min(4.0, scale + 0.15))}
          disabled={!hasDocument}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-30"
          title="확대"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={onFitWidth}
          disabled={!hasDocument}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-30"
          title="가로 너비 맞춤"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={onFitPage}
          disabled={!hasDocument}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-30"
          title="페이지 전체 맞춤"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      <div className="h-5 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1" />

      {/* Redaction Tools */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700 shrink-0">
        <button
          onClick={() => onModeChange('hand')}
          className={`flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded-md transition shrink-0 whitespace-nowrap ${
            mode === 'hand'
              ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-400 font-bold shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title="스크롤 / 이동 모드 (H)"
        >
          <Hand className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">이동</span>
        </button>

        <button
          onClick={() => onModeChange('mosaic')}
          className={`flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded-md transition shrink-0 whitespace-nowrap ${
            mode === 'mosaic'
              ? 'bg-sky-500 text-white font-bold shadow-sm shadow-sky-500/30'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title="드래그하여 모자이크 처리 (M)"
        >
          <Grid className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">모자이크</span>
        </button>

        <button
          onClick={() => onModeChange('blackout')}
          className={`flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded-md transition shrink-0 whitespace-nowrap ${
            mode === 'blackout'
              ? 'bg-gray-900 text-white dark:bg-gray-600 font-bold shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title="드래그하여 검정색 박스로 가리기 (B)"
        >
          <Square className="w-3.5 h-3.5 fill-current shrink-0" />
          <span className="hidden md:inline">블랙아웃</span>
        </button>

        <button
          onClick={() => onModeChange('whiteout')}
          className={`flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded-md transition shrink-0 whitespace-nowrap ${
            mode === 'whiteout'
              ? 'bg-white text-gray-900 border border-gray-300 font-bold shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title="드래그하여 흰색 박스로 가리기 (W)"
        >
          <Square className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">화이트아웃</span>
        </button>
      </div>

      {/* Mosaic Block Size Slider (active when mosaic tool selected) */}
      {mode === 'mosaic' && (
        <div className="flex items-center gap-1.5 md:gap-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 px-2 md:px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
          <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <span className="hidden md:inline text-sky-700 dark:text-sky-300 font-medium">격자:</span>
          <input
            type="range"
            min={2}
            max={40}
            step={2}
            value={blockSize}
            onChange={(e) => onBlockSizeChange(parseInt(e.target.value))}
            className="w-16 md:w-20 accent-sky-500 h-1.5 bg-sky-200 rounded-lg cursor-pointer"
          />
          <span className="text-sky-700 dark:text-sky-300 font-bold text-[11px] w-5 text-right shrink-0">
            {blockSize}
          </span>
        </div>
      )}

      {/* Sidebar Toggle */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        <button
          onClick={onToggleSidebar}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition shrink-0 whitespace-nowrap ${
            sidebarOpen
              ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          title="가림 영역 목록 패널 열기/닫기"
        >
          <PanelRight className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline font-medium">가림 목록</span>
          {redactionsCount > 0 && (
            <span className="px-1.5 py-0.2 bg-gray-200 dark:bg-gray-700 rounded-full text-[10px] font-bold shrink-0">
              {redactionsCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
