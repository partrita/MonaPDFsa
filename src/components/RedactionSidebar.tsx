import React from 'react';
import { RedactionItem } from '../types';
import { Trash2, Grid, Square, X, ExternalLink } from 'lucide-react';

interface RedactionSidebarProps {
  open: boolean;
  onClose: () => void;
  redactions: RedactionItem[];
  currentPage: number;
  onNavigatePage: (page: number) => void;
  onRemoveRedaction: (id: string) => void;
  onClearPageRedactions: (page: number) => void;
  onClearAllRedactions: () => void;
}

export const RedactionSidebar: React.FC<RedactionSidebarProps> = ({
  open,
  onClose,
  redactions,
  currentPage,
  onNavigatePage,
  onRemoveRedaction,
  onClearPageRedactions,
  onClearAllRedactions,
}) => {
  if (!open) return null;

  const currentPageItems = redactions.filter((r) => r.page === currentPage);
  const otherPageItems = redactions.filter((r) => r.page !== currentPage);

  return (
    <aside className="w-72 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col shrink-0 select-none text-xs z-20 shadow-lg">
      {/* Sidebar Header */}
      <div className="h-13 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
          <span>가림 영역 목록</span>
          <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 font-semibold text-[10px]">
            총 {redactions.length}개
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Global Actions */}
      {redactions.length > 0 && (
        <div className="p-3 border-b border-gray-100 dark:border-gray-800/80 flex items-center gap-2 bg-gray-50/50 dark:bg-gray-850/50">
          {currentPageItems.length > 0 && (
            <button
              onClick={() => onClearPageRedactions(currentPage)}
              className="flex-1 py-1.5 px-2 bg-gray-200/80 dark:bg-gray-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 text-gray-700 dark:text-gray-300 rounded text-[11px] font-medium transition"
            >
              현재 페이지 지우기
            </button>
          )}
          <button
            onClick={onClearAllRedactions}
            className="flex-1 py-1.5 px-2 bg-gray-200/80 dark:bg-gray-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 text-gray-700 dark:text-gray-300 rounded text-[11px] font-medium transition"
          >
            전체 비우기
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {redactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <p>등록된 가림 영역이 없습니다.</p>
            <p className="text-[11px] mt-1">툴바의 모자이크 도구를 선택 후 PDF 위에서 드래그하세요.</p>
          </div>
        ) : (
          <>
            {/* Current Page Items */}
            {currentPageItems.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  현재 페이지 ({currentPage}p)
                </h4>
                <div className="space-y-2">
                  {currentPageItems.map((r, i) => (
                    <RedactionCard
                      key={r.id}
                      item={r}
                      index={i + 1}
                      onRemove={() => onRemoveRedaction(r.id)}
                      onJump={() => onNavigatePage(r.page)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Other Pages Items */}
            {otherPageItems.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  다른 페이지
                </h4>
                <div className="space-y-2">
                  {otherPageItems.map((r, i) => (
                    <RedactionCard
                      key={r.id}
                      item={r}
                      index={i + 1}
                      onRemove={() => onRemoveRedaction(r.id)}
                      onJump={() => onNavigatePage(r.page)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};

const RedactionCard: React.FC<{
  item: RedactionItem;
  index: number;
  onRemove: () => void;
  onJump: () => void;
}> = ({ item, index, onRemove, onJump }) => {
  return (
    <div className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/80 hover:border-sky-300 dark:hover:border-sky-700 transition flex items-center justify-between group shadow-sm">
      <div className="flex items-center gap-2.5 overflow-hidden cursor-pointer" onClick={onJump}>
        <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
          {item.style === 'mosaic' ? (
            <Grid className="w-4 h-4 text-sky-500" />
          ) : item.style === 'blackout' ? (
            <Square className="w-4 h-4 fill-current text-gray-900 dark:text-white" />
          ) : (
            <Square className="w-4 h-4 text-gray-400" />
          )}
        </div>

        <div className="truncate">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-900 dark:text-gray-100">
              {item.page}페이지 #{index}
            </span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">
              ({item.style === 'mosaic' ? '모자이크' : item.style === 'blackout' ? '블랙아웃' : '화이트아웃'})
            </span>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">
            {Math.round(item.pdfWidth)}×{Math.round(item.pdfHeight)} pt
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onJump}
          className="p-1 text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 rounded transition opacity-0 group-hover:opacity-100"
          title="이 페이지로 이동"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition opacity-0 group-hover:opacity-100"
          title="삭제"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
