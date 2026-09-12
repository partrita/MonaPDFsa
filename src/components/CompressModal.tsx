import React, { useState, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import {
  Gauge,
  X,
  FileDown,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Save,
  Loader2,
  HelpCircle,
} from 'lucide-react';

export interface CompressionResult {
  output_path: string;
  original_size: number;
  compressed_size: number;
  reduction_percent: number;
  pages: number;
  image_count: number;
}

interface CompressModalProps {
  open: boolean;
  inputPath: string;
  inputName: string;
  inputSize: number;
  onClose: () => void;
  onDone: (result: CompressionResult) => void;
}

function fmt(bytes: number): string {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

export const CompressModal: React.FC<CompressModalProps> = ({
  open,
  inputPath,
  inputName,
  inputSize,
  onClose,
  onDone,
}) => {
  const originalMb = useMemo(() => {
    return Math.max(0.01, +(inputSize / (1024 * 1024)).toFixed(2));
  }, [inputSize]);

  // Minimum realistic achievable size: 15% of original, at least 0.15 MB
  const minAchievableMb = useMemo(() => {
    return Math.max(0.15, +(originalMb * 0.15).toFixed(2));
  }, [originalMb]);

  const [targetMbStr, setTargetMbStr] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the modal opens or input document changes
  useEffect(() => {
    if (open) {
      // Default to 50% of current size for convenient starting point
      const suggested = Math.max(minAchievableMb, +(originalMb * 0.5).toFixed(2));
      setTargetMbStr(suggested.toString());
      setError(null);
      setLoading(false);
    }
  }, [open, originalMb, minAchievableMb]);

  const targetMbNum = parseFloat((targetMbStr || '').trim());
  const hasInput = (targetMbStr || '').trim().length > 0 && !isNaN(targetMbNum);

  // Real-time evaluation of feasibility
  const assessment = useMemo(() => {
    if (!hasInput) {
      return {
        status: 'empty' as const,
        isPossible: false,
        level: 0,
        message: '원하시는 목표 용량을 MB 단위로 입력해주세요.',
      };
    }

    if (targetMbNum <= 0) {
      return {
        status: 'impossible' as const,
        isPossible: false,
        level: 0,
        message: '0보다 큰 목표 용량을 입력해주세요.',
      };
    }

    // Case 1: Target is greater than or equal to current size
    if (targetMbNum >= originalMb) {
      return {
        status: 'possible' as const,
        isPossible: true,
        level: 0,
        message: '현재 파일 크기보다 큽니다. 불필요 객체 정리와 무손실 스트림 압축이 적용됩니다.',
        reductionEst: '무손실 정리',
      };
    }

    // Case 2: Target is too low to be feasible
    if (targetMbNum < minAchievableMb) {
      return {
        status: 'impossible' as const,
        isPossible: false,
        level: 100,
        message: `입력하신 용량(${targetMbNum} MB)은 너무 낮아 달성하기 어렵습니다. 문서 구조 유지를 위해 최소 ${minAchievableMb} MB 이상을 권장합니다.`,
      };
    }

    // Case 3: Target is feasible
    const ratio = targetMbNum / originalMb; // e.g. 0.5
    let level = 50;
    if (ratio >= 0.85) {
      level = 20;
    } else if (ratio >= 0.65) {
      level = 45;
    } else if (ratio >= 0.45) {
      level = 65;
    } else if (ratio >= 0.30) {
      level = 80;
    } else {
      level = 95;
    }

    const estReduction = Math.round((1 - ratio) * 100);

    return {
      status: 'possible' as const,
      isPossible: true,
      level,
      message: `가능한 목표 용량입니다 (예상 약 ${estReduction}% 용량 절감).`,
      reductionEst: `약 ${estReduction}% 절감`,
    };
  }, [hasInput, targetMbNum, originalMb, minAchievableMb]);

  if (!open) return null;

  // Click Save: opens file save dialog, prompts for filename, then executes compression
  const handleSave = async () => {
    if (!assessment.isPossible) return;

    try {
      const defaultName = inputName.replace(/\.pdf$/i, '') + '_compressed.pdf';
      const out = await save({
        defaultPath: defaultName,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      });

      if (!out) {
        // User cancelled file dialog
        return;
      }

      setLoading(true);
      setError(null);

      const r = await invoke<CompressionResult>('cmd_compress_pdf', {
        inputPath,
        level: assessment.level,
        outputPath: out,
      });

      setLoading(false);
      onDone(r);
    } catch (e: any) {
      setLoading(false);
      setError(`압축 중 오류가 발생했습니다: ${String(e)}`);
    }
  };

  const handlePreset = (fraction: number) => {
    const val = Math.max(minAchievableMb, +(originalMb * fraction).toFixed(2));
    setTargetMbStr(val.toString());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={!loading ? onClose : undefined}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-inner">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">PDF 용량 최적화</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">목표 용량을 설정하여 압축을 수행합니다</p>
            </div>
          </div>
          {/*<button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>*/}
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* File Information */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 text-xs">
            <FileDown className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="font-medium text-gray-800 dark:text-gray-200 truncate flex-1">{inputName}</span>
            <span className="font-bold text-gray-900 dark:text-gray-100 shrink-0">{fmt(inputSize)}</span>
          </div>

          {/* Size Configuration Row */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {/* Current Size Box */}
              <div className="flex-1">
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  현재 파일 용량
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-800 dark:text-gray-200">
                  {originalMb.toFixed(2)} MB
                </div>
              </div>

              <div className="pt-5 text-gray-400">
                <ArrowRight className="w-4 h-4" />
              </div>

              {/* Target Size Input Box */}
              <div className="flex-1">
                <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  목표 용량 입력 (MB)
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={targetMbStr}
                    onChange={(e) => {
                      setTargetMbStr(e.target.value);
                      setError(null);
                    }}
                    placeholder={`예: ${(originalMb * 0.5).toFixed(1)}`}
                    disabled={loading}
                    className="w-full px-3.5 py-2 pr-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 pointer-events-none">
                    MB
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[11px] text-gray-400 mr-1">빠른 추천:</span>
              <button
                type="button"
                onClick={() => handlePreset(0.75)}
                disabled={loading}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition"
              >
                75% ({(originalMb * 0.75).toFixed(1)}MB)
              </button>
              <button
                type="button"
                onClick={() => handlePreset(0.5)}
                disabled={loading}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition"
              >
                50% ({(originalMb * 0.5).toFixed(1)}MB)
              </button>
              <button
                type="button"
                onClick={() => handlePreset(0.25)}
                disabled={loading}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition"
              >
                25% ({(originalMb * 0.25).toFixed(1)}MB)
              </button>
            </div>
          </div>

          {/* Feasibility Evaluation Card */}
          {assessment.status === 'possible' && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold">{assessment.message}</div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400/90">
                  아래 '파일 저장하기' 버튼을 누르면 저장할 파일명을 지정할 수 있습니다.
                </div>
              </div>
            </div>
          )}

          {assessment.status === 'impossible' && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 p-3.5 text-xs text-red-800 dark:text-red-300 flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold">목표 용량 달성 불가</div>
                <div className="text-[11px] text-red-700 dark:text-red-300/90 leading-relaxed">
                  {assessment.message}
                </div>
              </div>
            </div>
          )}

          {assessment.status === 'empty' && (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{assessment.message}</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-900/80 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition disabled:opacity-40"
          >
            닫기
          </button>

          {/* Save Button only appears when the target capacity is feasible */}
          {assessment.isPossible && (
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-600/25 transition active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>압축 처리 및 저장 중...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>파일 저장</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
