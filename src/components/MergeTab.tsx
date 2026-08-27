import React, { useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { MergeItem } from '../types';
import { formatBytes } from '../utils/mosaicFilter';
import {
  Layers,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
} from 'lucide-react';

interface MergeTabProps {
  onLoadMergedInViewer?: (path: string) => void;
}

export const MergeTab: React.FC<MergeTabProps> = ({ onLoadMergedInViewer }) => {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string; path?: string } | null>(null);

  const handleAddFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      });

      if (!selected) return;

      const filePaths: string[] = Array.isArray(selected) ? selected : [selected];
      const newItems: MergeItem[] = [];

      for (const p of filePaths) {
        try {
          const info: any = await invoke('read_pdf_file', { path: p });
          newItems.push({
            id: `merge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            filePath: p,
            fileName: info.file_name,
            fileSize: info.file_size,
            pageCount: info.page_count,
          });
        } catch (e) {
          // If read_pdf_file fails, still add basic entry
          const parts = p.split(/[/\\]/);
          newItems.push({
            id: `merge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            filePath: p,
            fileName: parts[parts.length - 1] || 'document.pdf',
            fileSize: 0,
          });
        }
      }

      setItems((prev) => [...prev, ...newItems]);
      setStatusMessage(null);
    } catch (err: any) {
      console.error('File open error:', err);
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setItems(newItems);
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    setItems([]);
    setStatusMessage(null);
  };

  const handleRunMerge = async () => {
    if (items.length < 2) {
      setStatusMessage({ type: 'error', text: '병합하려면 최소 2개 이상의 PDF 파일이 필요합니다.' });
      return;
    }

    try {
      const outputPath = await save({
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
        defaultPath: 'merged_document.pdf',
      });

      if (!outputPath) return;

      setIsMerging(true);
      setStatusMessage(null);

      const paths = items.map((i) => i.filePath);
      const resPath: string = await invoke('cmd_pdf_merge', {
        inputPaths: paths,
        outputPath,
      });

      setIsMerging(false);
      setStatusMessage({
        type: 'success',
        text: `성공적으로 ${items.length}개의 PDF 문서가 병합되었습니다!`,
        path: resPath,
      });
    } catch (err: any) {
      setIsMerging(false);
      setStatusMessage({
        type: 'error',
        text: `병합 실패: ${err?.toString() || '알 수 없는 오류'}`,
      });
    }
  };

  const totalPages = items.reduce((acc, item) => acc + (item.pageCount || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-8 flex justify-center select-none text-xs">
      <div className="max-w-3xl w-full flex flex-col gap-6">
        {/* Title Card */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">PDF 다중 파일 병합 (Merge)</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                여러 개의 PDF 문서를 원하는 순서대로 배치하여 하나의 완전한 PDF로 결합합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddFiles}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-semibold shadow-md shadow-sky-600/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>파일 추가</span>
            </button>
            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 text-gray-600 dark:text-gray-400 rounded-xl transition"
              >
                전체 삭제
              </button>
            )}
          </div>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              )}
              <div>
                <p className="font-semibold">{statusMessage.text}</p>
                {statusMessage.path && (
                  <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 break-all">
                    저장 경로: {statusMessage.path}
                  </p>
                )}
              </div>
            </div>

            {statusMessage.path && onLoadMergedInViewer && (
              <button
                onClick={() => onLoadMergedInViewer(statusMessage.path!)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-sm transition shrink-0"
              >
                뷰어에서 열기
              </button>
            )}
          </div>
        )}

        {/* Items List */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between text-gray-500 dark:text-gray-400 font-medium">
            <span>병합 대상 파일 목록 ({items.length}개)</span>
            {items.length > 0 && totalPages > 0 && (
              <span>예상 총 페이지: {totalPages} 페이지</span>
            )}
          </div>

          {items.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-500 gap-2">
              <FileText className="w-10 h-10 stroke-1" />
              <p className="text-sm font-medium">추가된 PDF 파일이 없습니다.</p>
              <p className="text-xs">상단의 '파일 추가' 버튼을 눌러 병합할 문서를 선택하세요.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50/80 dark:hover:bg-gray-850/50 transition group"
                >
                  <div className="flex items-center gap-3.5 overflow-hidden">
                    <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center text-[11px] shrink-0">
                      {index + 1}
                    </span>

                    <div className="truncate">
                      <p className="font-bold text-gray-900 dark:text-gray-100 truncate text-sm">
                        {item.fileName}
                      </p>
                      <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-[11px] mt-0.5">
                        {item.fileSize > 0 && <span>{formatBytes(item.fileSize)}</span>}
                        {item.pageCount && <span>• {item.pageCount} 페이지</span>}
                        <span className="font-mono truncate max-w-xs">• {item.filePath}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ordering & Delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMove(index, 'up')}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-20 transition"
                      title="위로 이동"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMove(index, 'down')}
                      disabled={index === items.length - 1}
                      className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-20 transition"
                      title="아래로 이동"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 text-gray-400 transition ml-2"
                      title="목록에서 제거"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Merge Action Footer */}
          {items.length > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-850/50 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end">
              <button
                onClick={handleRunMerge}
                disabled={isMerging || items.length < 2}
                className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-400 text-white font-bold rounded-xl shadow-md shadow-sky-600/25 transition active:scale-95 text-sm"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>병합 처리 중...</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    <span>PDF 병합 실행하기</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
