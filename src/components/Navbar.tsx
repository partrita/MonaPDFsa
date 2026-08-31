import React from 'react';
import { FileText, LayoutGrid, Layers, Scissors, Sun, Moon } from 'lucide-react';

export type ActiveTab = 'viewer' | 'studio' | 'merge' | 'split';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isDark: boolean;
  setIsDark: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isDark,
  setIsDark,
}) => {
  return (
    <header className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md flex items-center justify-between px-4 z-30 shrink-0 select-none">
      {/* MonaPDFsa Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-sky-500 to-amber-400 p-[1.5px] shadow-md shadow-sky-500/20">
          <div className="w-full h-full bg-gray-900 rounded-[10px] flex items-center justify-center overflow-hidden">
            <img
              src="/favicon.png"
              alt="MonaPDFsa Logo"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to text icon if image not loaded yet
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="text-white font-black text-xs">MP</span>
          </div>
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            MonaPDFsa
            <span className="text-[10px] uppercase font-semibold bg-gradient-to-r from-sky-500 to-indigo-600 text-white px-1.5 py-0.5 rounded shadow-sm">
              Studio
            </span>
          </h1>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">PDF Viewer, Redactor & Page Organizer</p>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <nav className="flex items-center gap-1 bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
        <button
          onClick={() => setActiveTab('viewer')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'viewer'
              ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>뷰어 & 모자이크</span>
        </button>

        <button
          onClick={() => setActiveTab('studio')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'studio'
              ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <LayoutGrid className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-gray-900 dark:text-gray-100">통합 페이지 스튜디오 (드래그 관리)</span>
        </button>

        <button
          onClick={() => setActiveTab('merge')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'merge'
              ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>단순 병합</span>
        </button>

        <button
          onClick={() => setActiveTab('split')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'split'
              ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>단순 분할</span>
        </button>
      </nav>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsDark((prev) => !prev)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
