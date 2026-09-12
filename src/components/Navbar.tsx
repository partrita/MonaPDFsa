import React from 'react';
import { FileText, LayoutGrid, Sun, Moon, Info } from 'lucide-react';

export type ActiveTab = 'viewer' | 'organizer' | 'about';

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
      {/* Minimal Brand */}
      <div className="flex items-center pl-1">
      </div>

      {/* Main Navigation Tabs */}
      <nav className="flex items-center gap-1 bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shrink-0">
        <button
          onClick={() => setActiveTab('viewer')}
          className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 whitespace-nowrap ${activeTab === 'viewer'
              ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          title="내용 가리기"
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">내용 가리기</span>
        </button>

        <button
          onClick={() => setActiveTab('organizer')}
          className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 whitespace-nowrap ${activeTab === 'organizer'
              ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          title="페이지 관리"
        >
          <LayoutGrid className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">페이지 관리</span>
        </button>

        <button
          onClick={() => setActiveTab('about')}
          className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 whitespace-nowrap ${activeTab === 'about'
              ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          title="정보"
        >
          <Info className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">정보</span>
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
