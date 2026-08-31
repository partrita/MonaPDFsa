import React, { useState, useRef } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { PageStudioItem } from '../types';
import { generateThumbnailFromBase64 } from '../utils/pdfRenderer';
import {
  LayoutGrid,
  Plus,
  RotateCw,
  RotateCcw,
  Trash2,
  Scissors,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FilePlus,
  Layers,
  ArrowLeftRight,
  GripVertical,
} from 'lucide-react';

interface PageStudioTabProps {
  onOpenInViewer: (filePath: string, pageNum?: number) => void;
}

export const PageStudioTab: React.FC<PageStudioTabProps> = ({ onOpenInViewer }) => {
  const [pages, setPages] = useState<PageStudioItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string; path?: string } | null>(null);

  // Drag and drop reordering state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fileCacheRef = useRef<Map<string, { base64: string; count: number }>>(new Map());

  // PDF 파일 추가 핸들러
  const handleAddFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      });

      if (!selected) return;

      const filePaths: string[] = Array.isArray(selected) ? selected : [selected];
      setIsLoading(true);
      setStatusMessage(null);

      const newPages: PageStudioItem[] = [];

      for (const p of filePaths) {
        let fileInfo: any;
        if (fileCacheRef.current.has(p)) {
          const cached = fileCacheRef.current.get(p)!;
          fileInfo = {
            file_path: p,
            file_name: p.split(/[/\\]/).pop() || 'document.pdf',
            page_count: cached.count,
            base64_data: cached.base64,
          };
        } else {
          fileInfo = await invoke('read_pdf_file', { path: p });
          fileCacheRef.current.set(p, {
            base64: fileInfo.base64_data,
            count: fileInfo.page_count,
          });
        }

        // 각 페이지 썸네일 생성 및 목록 추가
        for (let pNum = 1; pNum <= fileInfo.page_count; pNum++) {
          const thumbUrl = await generateThumbnailFromBase64(fileInfo.base64_data, pNum, 220);
          newPages.push({
            id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            sourceFilePath: p,
            sourceFileName: fileInfo.file_name,
            sourcePageIndex: pNum,
            rotation: 0,
            thumbnailUrl: thumbUrl,
            isSplitBreak: false,
          });
        }
      }

      setPages((prev) => [...prev, ...newPages]);
      setIsLoading(false);
      setStatusMessage({
        type: 'success',
        text: `성공적으로 ${newPages.length}개의 페이지가 추가되었습니다.`,
      });
    } catch (err: any) {
      setIsLoading(false);
      console.error('페이지 추가 실패:', err);
      setStatusMessage({
        type: 'error',
        text: `파일을 불러오는 중 오류가 발생했습니다: ${err?.toString() || '알 수 없는 오류'}`,
      });
    }
  };

  // 드래그 앤 드롭 재배치 핸들러
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // 드래그 고스트 이미지 투명도 조정
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setData('text/plain', index.toString());
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...pages];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setPages(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 개별 페이지 회전 (90도)
  const handleRotatePage = (index: number, angle: number) => {
    setPages((prev) => {
      const next = [...prev];
      const current = next[index];
      const newRot = (current.rotation + angle) % 360;
      next[index] = {
        ...current,
        rotation: newRot < 0 ? newRot + 360 : newRot,
      };
      return next;
    });
  };

  // 전체 페이지 일괄 회전
  const handleRotateAll = (angle: number) => {
    setPages((prev) =>
      prev.map((item) => {
        const newRot = (item.rotation + angle) % 360;
        return {
          ...item,
          rotation: newRot < 0 ? newRot + 360 : newRot,
        };
      })
    );
  };

  // 개별 페이지 삭제
  const handleRemovePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  };

  // 전체 페이지 초기화
  const handleClearAll = () => {
    setPages([]);
    setStatusMessage(null);
  };

  // 순서 역순 뒤집기
  const handleReverseOrder = () => {
    setPages((prev) => [...prev].reverse());
  };

  // 분할 구분점(Split Break) 토글
  const handleToggleSplitBreak = (index: number) => {
    setPages((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        isSplitBreak: !next[index].isSplitBreak,
      };
      return next;
    });
  };

  // 현재 순서대로 병합 저장 (Export Merged)
  const handleExportMerged = async () => {
    if (pages.length === 0) return;

    try {
      const outputPath = await save({
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
        defaultPath: 'organized_document.pdf',
      });

      if (!outputPath) return;

      setIsExporting(true);
      setStatusMessage(null);

      const pageSpecs = pages.map((p) => ({
        source_path: p.sourceFilePath,
        page_number: p.sourcePageIndex,
        rotation: p.rotation,
      }));

      await invoke('cmd_pdf_organize_and_export', {
        pages: pageSpecs,
        outputPath,
      });

      setIsExporting(false);
      setStatusMessage({
        type: 'success',
        text: `성공적으로 ${pages.length}페이지로 구성된 PDF가 저장되었습니다!`,
        path: outputPath,
      });
    } catch (err: any) {
      setIsExporting(false);
      console.error('내보내기 실패:', err);
      setStatusMessage({
        type: 'error',
        text: `내보내기 실패: ${err?.toString() || '알 수 없는 오류'}`,
      });
    }
  };

  // 분할 구분점에 따라 개별 파일들로 저장 (Export Split)
  const handleExportSplitByBreaks = async () => {
    if (pages.length === 0) return;

    try {
      const defaultDir = pages[0].sourceFilePath.substring(
        0,
        Math.max(pages[0].sourceFilePath.lastIndexOf('/'), pages[0].sourceFilePath.lastIndexOf('\\'))
      );

      // 분할 그룹 분리
      const groups: PageStudioItem[][] = [];
      let currentGroup: PageStudioItem[] = [];

      for (let i = 0; i < pages.length; i++) {
        currentGroup.push(pages[i]);
        if (pages[i].isSplitBreak || i === pages.length - 1) {
          groups.push(currentGroup);
          currentGroup = [];
        }
      }

      if (groups.length <= 1) {
        setStatusMessage({
          type: 'error',
          text: "분할할 지점이 지정되지 않았습니다. 카드 하단의 '가위(✂️)' 아이콘을 클릭하여 분할 구분점을 추가하세요.",
        });
        return;
      }

      setIsExporting(true);
      setStatusMessage(null);

      const savedPaths: string[] = [];
      const timestamp = Date.now();

      for (let gIdx = 0; gIdx < groups.length; gIdx++) {
        const group = groups[gIdx];
        const outName = `split_part_${gIdx + 1}_of_${groups.length}_${timestamp}.pdf`;
        const outPath = `${defaultDir}/${outName}`;

        const pageSpecs = group.map((p) => ({
          source_path: p.sourceFilePath,
          page_number: p.sourcePageIndex,
          rotation: p.rotation,
        }));

        await invoke('cmd_pdf_organize_and_export', {
          pages: pageSpecs,
          outputPath: outPath,
        });

        savedPaths.push(outPath);
      }

      setIsExporting(false);
      setStatusMessage({
        type: 'success',
        text: `성공적으로 ${groups.length}개의 분할 PDF 문서가 저장되었습니다! (저장 위치: ${defaultDir})`,
        path: savedPaths[0],
      });
    } catch (err: any) {
      setIsExporting(false);
      console.error('분할 내보내기 실패:', err);
      setStatusMessage({
        type: 'error',
        text: `분할 내보내기 실패: ${err?.toString() || '알 수 없는 오류'}`,
      });
    }
  };

  const splitBreakCount = pages.filter((p) => p.isSplitBreak).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-gray-950 overflow-hidden select-none">
      {/* Studio Header Toolbar */}
      <div className="px-6 py-3.5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shadow-sm shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              통합 페이지 스튜디오 (Unified Page Studio)
              <span className="text-[11px] font-normal px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400">
                총 {pages.length}페이지
              </span>
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              마우스 드래그로 순서 변경 • 페이지 추가/삭제/회전 • 원스톱 병합 및 분할 내보내기
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddFiles}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-400 text-white font-semibold rounded-xl text-xs shadow-md shadow-sky-600/20 transition active:scale-95"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus className="w-4 h-4" />}
            <span>PDF 문서 추가</span>
          </button>

          {pages.length > 0 && (
            <>
              <button
                onClick={() => handleRotateAll(90)}
                className="flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs transition"
                title="모든 페이지 시계방향 90도 회전"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>전체 90° 회전</span>
              </button>

              <button
                onClick={handleReverseOrder}
                className="flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs transition"
                title="페이지 순서 반전"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>순서 반전</span>
              </button>

              <button
                onClick={handleClearAll}
                className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 text-gray-500 rounded-xl text-xs transition"
                title="전체 페이지 비우기"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

              {/* Export Split by Breakpoints */}
              {splitBreakCount > 0 && (
                <button
                  onClick={handleExportSplitByBreaks}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition active:scale-95"
                >
                  <Scissors className="w-4 h-4" />
                  <span>분할 지점 기준 저장 ({splitBreakCount + 1}개 파일)</span>
                </button>
              )}

              {/* Export Merged */}
              <button
                onClick={handleExportMerged}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/20 transition active:scale-95"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>현재 순서로 병합 저장</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Floating Status Notification */}
      {statusMessage && (
        <div
          className={`mx-6 mt-4 p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-1 duration-150 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
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

          {statusMessage.path && (
            <button
              onClick={() => onOpenInViewer(statusMessage.path!)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-sm transition shrink-0"
            >
              뷰어에서 확인
            </button>
          )}
        </div>
      )}

      {/* Main Thumbnail Workspace Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {pages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div
              onClick={handleAddFiles}
              className="max-w-md w-full p-10 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 backdrop-blur hover:border-amber-500 dark:hover:border-amber-500 cursor-pointer transition flex flex-col items-center gap-4 group"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition shadow-inner">
                <LayoutGrid className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  편집할 PDF 문서들을 불러오세요
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  여러 개의 PDF를 추가하여 한 화면에서 마우스 드래그로 순서 변경, 삭제, 회전, 분할을 손쉽게 수행할 수 있습니다.
                </p>
              </div>
              <button className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md shadow-amber-500/25 transition">
                PDF 파일 선택하기
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-5 pb-12">
            {pages.map((item, index) => {
              const isDragging = draggedIndex === index;
              const isOver = dragOverIndex === index;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`group relative flex flex-col bg-white dark:bg-gray-900 rounded-2xl border transition-all duration-200 cursor-grab active:cursor-grabbing ${
                    isDragging
                      ? 'opacity-40 scale-95 border-amber-500 shadow-none'
                      : isOver
                      ? 'border-2 border-amber-500 scale-105 shadow-xl ring-4 ring-amber-500/20'
                      : 'border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  {/* Sequence Badge */}
                  <div className="absolute -top-2.5 -left-2.5 z-20 w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 text-white font-black text-[11px] flex items-center justify-center shadow-md">
                    {index + 1}
                  </div>

                  {/* Drag Handle Indicator */}
                  <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/80 text-white p-1 rounded-lg">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>

                  {/* Thumbnail Image Container */}
                  <div className="p-3 pb-1 flex items-center justify-center min-h-[160px] bg-gray-100/60 dark:bg-gray-950/60 rounded-t-2xl overflow-hidden relative">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={`Page ${item.sourcePageIndex}`}
                        style={{ transform: `rotate(${item.rotation}deg)` }}
                        className="max-h-[150px] w-auto object-contain rounded shadow-sm transition-transform duration-200"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-32 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    )}

                    {/* Split Break Marker Overlay Banner */}
                    {item.isSplitBreak && (
                      <div className="absolute bottom-0 inset-x-0 bg-emerald-600/95 text-white text-[10px] font-bold text-center py-0.5 shadow-md">
                        ✂️ 여기서 분할
                      </div>
                    )}
                  </div>

                  {/* Card Footer & Source Info */}
                  <div className="p-2.5 flex flex-col gap-1.5 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
                      <span className="truncate max-w-[90px] font-medium" title={item.sourceFileName}>
                        {item.sourceFileName}
                      </span>
                      <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[9px] shrink-0">
                        p.{item.sourcePageIndex}
                      </span>
                    </div>

                    {/* Card Control Buttons */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-50 dark:border-gray-850">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRotatePage(index, 90);
                          }}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 rounded transition"
                          title="시계방향 90도 회전"
                        >
                          <RotateCw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRotatePage(index, -90);
                          }}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 rounded transition"
                          title="반시계방향 90도 회전"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSplitBreak(index);
                          }}
                          className={`p-1 rounded transition ${
                            item.isSplitBreak
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-emerald-600'
                          }`}
                          title={item.isSplitBreak ? '분할 지점 해제' : '이 페이지 뒤에서 분할'}
                        >
                          <Scissors className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenInViewer(item.sourceFilePath, item.sourcePageIndex);
                          }}
                          className="p-1 hover:bg-sky-50 text-gray-400 hover:text-sky-600 rounded transition"
                          title="뷰어에서 열기 및 모자이크 편집"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePage(item.id);
                          }}
                          className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded transition"
                          title="이 페이지 제거"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
