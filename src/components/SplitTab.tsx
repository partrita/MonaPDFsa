import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { formatBytes } from '../utils/mosaicFilter';
import {
  Scissors,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Layers,
  Folder,
} from 'lucide-react';

interface SplitTabProps {
  onLoadFileInViewer?: (path: string) => void;
}

type SplitMode = 'ranges' | 'all' | 'extract';

export const SplitTab: React.FC<SplitTabProps> = ({ onLoadFileInViewer }) => {
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
    size: number;
    pages: number;
  } | null>(null);

  const [splitMode, setSplitMode] = useState<SplitMode>('ranges');
  const [rangeInput, setRangeInput] = useState<string>('1-2, 3');
  const [extractInput, setExtractInput] = useState<string>('1');
  const [outputDir, setOutputDir] = useState<string>('');
  const [isSplitting, setIsSplitting] = useState(false);
  const [resultFiles, setResultFiles] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      });

      if (!selected || Array.isArray(selected)) return;

      const info: any = await invoke('read_pdf_file', { path: selected });
      setSelectedFile({
        path: selected,
        name: info.file_name,
        size: info.file_size,
        pages: info.page_count,
      });

      // Default range string suggestion
      if (info.page_count > 1) {
        setRangeInput(`1-${Math.ceil(info.page_count / 2)}, ${Math.ceil(info.page_count / 2) + 1}-${info.page_count}`);
      } else {
        setRangeInput('1');
      }

      // Default output directory: same folder as file
      const dirIndex = Math.max(selected.lastIndexOf('/'), selected.lastIndexOf('\\'));
      if (dirIndex > 0) {
        setOutputDir(selected.substring(0, dirIndex));
      }

      setResultFiles([]);
      setStatusMessage(null);
    } catch (err: any) {
      console.error('Failed to select file:', err);
    }
  };

  const handleSelectOutputDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && !Array.isArray(selected)) {
        setOutputDir(selected);
      }
    } catch (err) {
      console.error('Failed to select output folder:', err);
    }
  };

  const handleRunSplit = async () => {
    if (!selectedFile) {
      setStatusMessage({ type: 'error', text: '먼저 분할할 PDF 파일을 선택해주세요.' });
      return;
    }

    if (!outputDir) {
      setStatusMessage({ type: 'error', text: '저장할 대상 디렉터리를 지정해주세요.' });
      return;
    }

    // Prepare ranges according to mode
    let ranges: { label?: string; start: number; end: number }[] = [];
    const baseName = selectedFile.name.replace(/\.pdf$/i, '');

    if (splitMode === 'all') {
      for (let p = 1; p <= selectedFile.pages; p++) {
        ranges.push({
          label: `${baseName}_p${String(p).padStart(3, '0')}`,
          start: p,
          end: p,
        });
      }
    } else if (splitMode === 'extract') {
      const parts = extractInput.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n) && n >= 1 && n <= selectedFile.pages);
      if (parts.length === 0) {
        setStatusMessage({ type: 'error', text: '추출할 유효한 페이지 번호를 입력해주세요.' });
        return;
      }
      // Create separate or single extract
      for (const p of parts) {
        ranges.push({
          label: `${baseName}_page_${p}`,
          start: p,
          end: p,
        });
      }
    } else {
      // Range mode
      const rawRanges = rangeInput.split(',');
      for (const item of rawRanges) {
        const itemTrim = item.trim();
        if (!itemTrim) continue;
        if (itemTrim.includes('-')) {
          const [sStr, eStr] = itemTrim.split('-');
          const start = Math.max(1, Math.min(selectedFile.pages, parseInt(sStr.trim()) || 1));
          const end = Math.max(start, Math.min(selectedFile.pages, parseInt(eStr.trim()) || start));
          ranges.push({
            label: `${baseName}_p${start}-p${end}`,
            start,
            end,
          });
        } else {
          const page = Math.max(1, Math.min(selectedFile.pages, parseInt(itemTrim) || 1));
          ranges.push({
            label: `${baseName}_p${page}`,
            start: page,
            end: page,
          });
        }
      }
    }

    if (ranges.length === 0) {
      setStatusMessage({ type: 'error', text: '분할 구간이 비어있습니다. 올바른 페이지 번호나 범위를 입력해주세요.' });
      return;
    }

    try {
      setIsSplitting(true);
      setStatusMessage(null);

      const generated: string[] = await invoke('cmd_pdf_split', {
        inputPath: selectedFile.path,
        ranges,
        outputDir,
        outputPrefix: baseName,
      });

      setIsSplitting(false);
      setResultFiles(generated);
      setStatusMessage({
        type: 'success',
        text: `성공적으로 ${generated.length}개의 PDF 파일로 분할되었습니다!`,
      });
    } catch (err: any) {
      setIsSplitting(false);
      setStatusMessage({
        type: 'error',
        text: `분할 실패: ${err?.toString() || '알 수 없는 오류'}`,
      });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-8 flex justify-center select-none text-xs">
      <div className="max-w-3xl w-full flex flex-col gap-6">
        {/* Title Card */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <Scissors className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">PDF 문서 분할 (Split)</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">
              원하는 페이지 구간을 지정하거나 낱장으로 분할하여 개별 PDF 파일로 저장합니다.
            </p>
          </div>
        </div>

        {/* File Selection Card */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">분할할 원본 PDF</h3>
            <button
              onClick={handleSelectFile}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg shadow-sm transition"
            >
              <FolderOpen className="w-4 h-4" />
              <span>{selectedFile ? '다른 파일 선택' : 'PDF 파일 선택'}</span>
            </button>
          </div>

          {selectedFile ? (
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-850 border border-gray-200/80 dark:border-gray-700/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-sky-600 dark:text-sky-400" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{selectedFile.name}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-[11px] mt-0.5 font-mono">
                    총 {selectedFile.pages} 페이지 • {formatBytes(selectedFile.size)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={handleSelectFile}
              className="py-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 hover:border-sky-500 cursor-pointer transition"
            >
              <FolderOpen className="w-8 h-8 mb-2" />
              <p className="font-medium">분할할 PDF 파일을 선택해주세요</p>
            </div>
          )}
        </div>

        {/* Split Options (when file selected) */}
        {selectedFile && (
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col gap-5">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">분할 방식 설정</h3>

            {/* Mode Select Tabs */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
              <button
                onClick={() => setSplitMode('ranges')}
                className={`py-2 px-3 rounded-lg font-semibold transition ${
                  splitMode === 'ranges'
                    ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                페이지 범위 지정
              </button>
              <button
                onClick={() => setSplitMode('all')}
                className={`py-2 px-3 rounded-lg font-semibold transition ${
                  splitMode === 'all'
                    ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                모든 페이지 낱장 분할
              </button>
              <button
                onClick={() => setSplitMode('extract')}
                className={`py-2 px-3 rounded-lg font-semibold transition ${
                  splitMode === 'extract'
                    ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                특정 페이지 추출
              </button>
            </div>

            {/* Mode Detail Inputs */}
            {splitMode === 'ranges' && (
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-700 dark:text-gray-300">
                  분할 구간 입력 (쉼표로 구분):
                </label>
                <input
                  type="text"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  placeholder="예: 1-3, 4, 5-8"
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  * 예시: <code>1-3, 4, 5-{selectedFile.pages}</code> 처럼 입력하면 구간별로 개별 PDF가 생성됩니다. (최대 {selectedFile.pages}p)
                </p>
              </div>
            )}

            {splitMode === 'all' && (
              <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300">
                <p className="font-semibold">총 {selectedFile.pages}개의 낱장 PDF 파일이 생성됩니다.</p>
                <p className="text-[11px] mt-0.5">예: <code>{selectedFile.name.replace(/\.pdf$/i, '')}_p001.pdf</code>, <code>_p002.pdf</code> ...</p>
              </div>
            )}

            {splitMode === 'extract' && (
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-gray-700 dark:text-gray-300">
                  추출할 페이지 번호 (쉼표로 구분):
                </label>
                <input
                  type="text"
                  value={extractInput}
                  onChange={(e) => setExtractInput(e.target.value)}
                  placeholder="예: 1, 3, 5"
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            )}

            {/* Output Directory Picker */}
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-700 dark:text-gray-300">저장 경로 (폴더):</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  onClick={handleSelectOutputDir}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl font-semibold transition"
                >
                  <Folder className="w-4 h-4" />
                  <span>폴더 변경</span>
                </button>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleRunSplit}
              disabled={isSplitting}
              className="mt-2 flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-400 text-white font-bold rounded-xl shadow-md shadow-sky-600/25 transition active:scale-95 text-sm"
            >
              {isSplitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>PDF 분할 처리 중...</span>
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4" />
                  <span>PDF 분할 실행하기</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Status Notification */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl border flex items-center gap-3 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            )}
            <p className="font-semibold">{statusMessage.text}</p>
          </div>
        )}

        {/* Results List */}
        {resultFiles.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm mb-3">
              생성된 파일 ({resultFiles.length}개)
            </h4>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-60 overflow-y-auto">
              {resultFiles.map((f, i) => {
                const parts = f.split(/[/\\]/);
                const fn = parts[parts.length - 1];
                return (
                  <div key={i} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono truncate mr-2">
                      <FileText className="w-4 h-4 text-sky-500 shrink-0" />
                      <span className="truncate">{fn}</span>
                    </div>
                    {onLoadFileInViewer && (
                      <button
                        onClick={() => onLoadFileInViewer(f)}
                        className="px-2.5 py-1 bg-sky-50 dark:bg-sky-950 hover:bg-sky-100 text-sky-600 dark:text-sky-400 font-semibold rounded text-[11px] shrink-0"
                      >
                        뷰어에서 확인
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
