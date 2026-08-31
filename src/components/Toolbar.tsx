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
} from 'lucide-react';
import { RedactionMode } from '../types';

interface ToolbarProps {
  onOpenFile: () => void;
  onSaveFile: () => void;
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
    <div className="h-13 bg-white dark:bg-gray-850 border-b border-gray-200 dark:border-gray-800 px-4 flex items-center justify-between gap-2 overflow-x-auto text-xs shrink-0 select-none shadow-sm">
      {/* File Operations */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenFile}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium shadow-sm shadow-sky-600/20 transition active:scale-95"
        >
          <FolderOpen className="w-4 h-4" />
          <span>PDF 열기</span>
        </button>

        <button
          onClick={onSaveFile}
          disabled={!hasDocument || isSaving}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition active:scale-95 ${
            hasDocument && !isSaving
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
          title="모자이크/가림 처리를 적용하여 새 PDF로 저장"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? '저장 중...' : '가림 적용 저장'}</span>
          {redactionsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-white/20 rounded-full text-[10px] font-bold">
              {redactionsCount}
            </span>
          )}
        </button>

        {hasDocument && onCloseFile && (
          <button
            onClick={onCloseFile}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-red-50 dark:bg-gray-800 dark:hover:bg-red-950/40 text-gray-600 hover:text-red-600 dark:text-gray-300 dark:hover:text-red-400 font-medium border border-gray-200 dark:border-gray-700 transition active:scale-95"
            title="현재 열린 문서를 닫고 초기화"
          >
            <XCircle className="w-4 h-4 text-red-500" />
            <span>문서 닫기</span>
          </button>
        )}
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
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
        <button
          onClick={() => onModeChange('hand')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition ${
            mode === 'hand'
              ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-400 font-bold shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title="스크롤 / 이동 모드"
        >
          <Hand className="w-3.5 h-3.5" />
          <span>이동</span>
        </button>

        <button
          onClick={() => onModeChange('mosaic')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition ${
            mode === 'mosaic'
              ? 'bg-sky-500 text-white font-bold shadow-sm shadow-sky-500/30'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title="드래그하여 모자이크 처리 (Pixelate)"
        >
          <Grid className="w-3.5 h-3.5" />
          <span>모자이크</span>
        </button>

        <button
          onClick={() => onModeChange('blackout')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition ${
            mode === 'blackout'
              ? 'bg-gray-900 text-white dark:bg-gray-600 font-bold shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title="드래그하여 검정색 박스로 가리기"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>블랙아웃</span>
        </button>

        <button
          onClick={() => onModeChange('whiteout')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition ${
            mode === 'whiteout'
              ? 'bg-white text-gray-900 border border-gray-300 font-bold shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title="드래그하여 흰색 박스로 가리기"
        >
          <Square className="w-3.5 h-3.5" />
          <span>화이트아웃</span>
        </button>
      </div>

      {/* Mosaic Block Size Slider (active when mosaic tool selected) */}
      {mode === 'mosaic' && (
        <div className="flex items-center gap-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 px-2.5 py-1 rounded-lg">
          <Sparkles className="w-3.5 h-3.5 text-sky-500" />
          <span className="text-sky-700 dark:text-sky-300 font-medium">격자 크기:</span>
          <input
            type="range"
            min={4}
            max={36}
            step={2}
            value={blockSize}
            onChange={(e) => onBlockSizeChange(parseInt(e.target.value))}
            className="w-20 accent-sky-500 h-1.5 bg-sky-200 rounded-lg cursor-pointer"
          />
          <span className="text-sky-700 dark:text-sky-300 font-bold w-6 text-right">
            {blockSize}px
          </span>
        </div>
      )}

      {/* Sidebar Toggle */}
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={onToggleSidebar}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition ${
            sidebarOpen
              ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          title="가림 영역 목록 패널 열기/닫기"
        >
          <PanelRight className="w-4 h-4" />
          <span className="font-medium">가림 목록 ({redactionsCount})</span>
        </button>
      </div>
    </div>
  );
};
