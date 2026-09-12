import React from 'react';
import { User, Cpu, Layout, Package, ShieldCheck, ExternalLink } from 'lucide-react';
import { APP_INFO, ARCHITECTURE, TechEntry } from '../utils/techStack';

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-sky-500" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Row({ entry }: { entry: TechEntry }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-600 dark:text-gray-400">{entry.label}</span>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">{entry.value}</span>
    </div>
  );
}

export const AboutTab: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header with Custom App Logo */}
        <div className="flex items-center gap-4">
          <img
            src="/logo.png"
            alt="MonaPDFsa Logo"
            className="w-14 h-14 rounded-2xl shadow-lg shadow-sky-500/15 object-contain bg-white dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700"
          />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{APP_INFO.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              v{APP_INFO.version} · {APP_INFO.bundleId} · {APP_INFO.license}
            </p>
          </div>
        </div>

        <Section title="작성자 및 소스코드" icon={User}>
          <div className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm text-gray-600 dark:text-gray-400">작성자</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">{APP_INFO.author}</span>
          </div>
          <div className="flex items-start justify-between gap-3 py-1.5">
            <span className="text-sm text-gray-600 dark:text-gray-400">GitHub</span>
            <a
              href={APP_INFO.github}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-sky-600 dark:text-sky-400 text-right hover:underline inline-flex items-center gap-1.5"
            >
              <span>{APP_INFO.github}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </Section>

        <Section title="아키텍처" icon={Layout}>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {ARCHITECTURE.map((e) => <Row key={e.label} entry={e} />)}
          </div>
        </Section>

        <Section title="보안 및 처리 원칙" icon={ShieldCheck}>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-disc list-inside">
            <li>모든 처리는 로컬 컴퓨터에서 수행되며 어떤 외부 네트워크로 통신은 없습니다.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
};
