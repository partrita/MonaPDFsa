import React, { useState, useEffect, useRef, useCallback } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Navbar, ActiveTab } from './components/Navbar';
import { Toolbar } from './components/Toolbar';
import { PdfViewer } from './components/PdfViewer';
import { RedactionSidebar } from './components/RedactionSidebar';
import { MergeTab } from './components/MergeTab';
import { SplitTab } from './components/SplitTab';
import { PdfDocManager } from './utils/pdfRenderer';
import { RedactionItem, RedactionMode, LoadedPdf } from './types';
import { CheckCircle2, AlertCircle, X, FileUp } from 'lucide-react';

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('viewer');

  // PDF Viewer State
  const [loadedPdf, setLoadedPdf] = useState<LoadedPdf | null>(null);
  const docManagerRef = useRef<PdfDocManager>(new PdfDocManager());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [mode, setMode] = useState<RedactionMode>('hand');
  const [blockSize, setBlockSize] = useState(16);
  const [redactions, setRedactions] = useState<RedactionItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sync theme with html class
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Open PDF file handler
  const handleOpenFile = useCallback(async (specificPath?: string) => {
    try {
      let targetPath = specificPath;

      if (!targetPath) {
        const selected = await open({
          multiple: false,
          filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
        });
        if (!selected || Array.isArray(selected)) return;
        targetPath = selected;
      }

      const info: any = await invoke('read_pdf_file', { path: targetPath });
      const pages = await docManagerRef.current.loadFromBase64(info.base64_data);

      setLoadedPdf({
        filePath: info.file_path,
        fileName: info.file_name,
        fileSize: info.file_size,
        pageCount: pages,
        base64Data: info.base64_data,
      });

      setTotalPages(pages);
      setCurrentPage(1);
      setScale(1.0);
      setRedactions([]);
      setActiveTab('viewer');
      setNotification({
        type: 'success',
        message: `'${info.file_name}' (${pages}페이지) 문서를 불러왔습니다.`,
      });
    } catch (err: any) {
      console.error('Failed to open PDF:', err);
      setNotification({
        type: 'error',
        message: `PDF 열기 실패: ${err?.toString() || '알 수 없는 오류'}`,
      });
    }
  }, []);

  // Save redacted PDF
  const handleSaveFile = useCallback(async () => {
    if (!loadedPdf) return;

    try {
      const defaultName = loadedPdf.fileName.replace(/\.pdf$/i, '') + '_redacted.pdf';
      const outputPath = await save({
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
        defaultPath: defaultName,
      });

      if (!outputPath) return;

      setIsSaving(true);

      const rustRedactions = redactions.map((r) => ({
        id: r.id,
        page: r.page,
        x: r.pdfX,
        y: r.pdfY,
        width: r.pdfWidth,
        height: r.pdfHeight,
        style: r.style,
        image_data: r.imageData || null,
      }));

      await invoke('cmd_pdf_apply_redactions', {
        inputPath: loadedPdf.filePath,
        outputPath,
        redactions: rustRedactions,
      });

      setIsSaving(false);
      setNotification({
        type: 'success',
        message: `가림 처리가 적용된 PDF가 저장되었습니다:\n${outputPath}`,
      });
    } catch (err: any) {
      setIsSaving(false);
      console.error('Save failed:', err);
      setNotification({
        type: 'error',
        message: `저장 실패: ${err?.toString() || '알 수 없는 오류'}`,
      });
    }
  }, [loadedPdf, redactions]);

  // Native cross-platform drag-and-drop listener (Windows Explorer, macOS Finder, Linux File Manager)
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function setupDragDrop() {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onDragDropEvent((event) => {
          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            setIsDraggingOver(true);
          } else if (event.payload.type === 'leave') {
            setIsDraggingOver(false);
          } else if (event.payload.type === 'drop') {
            setIsDraggingOver(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const firstPdf = paths.find((p) => p.toLowerCase().endsWith('.pdf'));
              if (firstPdf) {
                handleOpenFile(firstPdf);
              }
            }
          }
        });
      } catch (e) {
        // Fallback for browser testing
      }
    }

    setupDragDrop();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleOpenFile]);

  // Cross-platform keyboard shortcuts (Cmd on Mac, Ctrl on Win/Linux)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenFile();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveFile();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setRedactions((prev) => prev.slice(0, -1));
      } else if (isCmdOrCtrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setScale((prev) => Math.min(4.0, prev + 0.15));
      } else if (isCmdOrCtrl && e.key === '-') {
        e.preventDefault();
        setScale((prev) => Math.max(0.3, prev - 0.15));
      } else if (isCmdOrCtrl && e.key === '0') {
        e.preventDefault();
        setScale(1.0);
      } else if (!isCmdOrCtrl && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else if (!isCmdOrCtrl && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
        setCurrentPage((prev) => Math.min(totalPages, prev + 1));
      } else if (!isCmdOrCtrl && (e.target as HTMLElement).tagName !== 'INPUT') {
        if (e.key.toLowerCase() === 'm') setMode('mosaic');
        else if (e.key.toLowerCase() === 'b') setMode('blackout');
        else if (e.key.toLowerCase() === 'w') setMode('whiteout');
        else if (e.key.toLowerCase() === 'h') setMode('hand');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenFile, handleSaveFile, totalPages]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleFitWidth = () => {
    setScale(1.25);
  };

  const handleFitPage = () => {
    setScale(0.85);
  };

  const handleAddRedaction = (item: RedactionItem) => {
    setRedactions((prev) => [...prev, item]);
  };

  const handleRemoveRedaction = (id: string) => {
    setRedactions((prev) => prev.filter((r) => r.id !== id));
  };

  const handleClearPageRedactions = (page: number) => {
    setRedactions((prev) => prev.filter((r) => r.page !== page));
  };

  const handleClearAllRedactions = () => {
    setRedactions([]);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden font-sans relative">
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-sky-600/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white pointer-events-none animate-in fade-in duration-150">
          <FileUp className="w-16 h-16 animate-bounce mb-3" />
          <h2 className="text-xl font-bold">PDF 파일을 여기에 놓으세요</h2>
          <p className="text-sm text-sky-100 mt-1">즉시 뷰어에서 문서가 열립니다</p>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDark={isDark}
        setIsDark={setIsDark}
      />

      {/* Main Body per Tab */}
      {activeTab === 'viewer' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Viewer Toolbar */}
          <Toolbar
            onOpenFile={() => handleOpenFile()}
            onSaveFile={handleSaveFile}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            scale={scale}
            onScaleChange={setScale}
            onFitWidth={handleFitWidth}
            onFitPage={handleFitPage}
            mode={mode}
            onModeChange={setMode}
            blockSize={blockSize}
            onBlockSizeChange={setBlockSize}
            redactionsCount={redactions.length}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            isSaving={isSaving}
            hasDocument={!!loadedPdf}
          />

          {/* Viewer Content + Sidebar */}
          <div className="flex-1 flex min-h-0 relative">
            <PdfViewer
              docManager={docManagerRef.current}
              currentPage={currentPage}
              scale={scale}
              mode={mode}
              blockSize={blockSize}
              redactions={redactions}
              onAddRedaction={handleAddRedaction}
              onRemoveRedaction={handleRemoveRedaction}
              onOpenFile={() => handleOpenFile()}
              hasDocument={!!loadedPdf}
            />

            <RedactionSidebar
              open={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              redactions={redactions}
              currentPage={currentPage}
              onNavigatePage={handlePageChange}
              onRemoveRedaction={handleRemoveRedaction}
              onClearPageRedactions={handleClearPageRedactions}
              onClearAllRedactions={handleClearAllRedactions}
            />
          </div>
        </div>
      )}

      {activeTab === 'merge' && (
        <MergeTab onLoadMergedInViewer={(path) => handleOpenFile(path)} />
      )}

      {activeTab === 'split' && (
        <SplitTab onLoadFileInViewer={(path) => handleOpenFile(path)} />
      )}

      {/* Floating Notification Toast */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-xl shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none">
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">
            <p className="font-semibold whitespace-pre-line text-gray-900 dark:text-gray-100">
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
