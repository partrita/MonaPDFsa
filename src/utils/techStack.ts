export interface TechEntry {
  label: string;
  value: string;
  hint?: string;
}

export const APP_INFO = {
  name: 'MonaPDFsa',
  version: '0.2.0',
  bundleId: 'com.monapdfsa.app',
  license: 'MIT',
  author: 'Taeyoon Kim',
  github: 'https://github.com/partrita/MonaPDFsa',
} as const;

export const ARCHITECTURE: TechEntry[] = [
  { label: 'Frontend', value: 'React 18.3.1 + TypeScript 5.7.3' },
  { label: 'Build', value: 'Vite 6.0.7' },
  { label: 'Styling', value: 'TailwindCSS 3.4.17 + PostCSS' },
  { label: 'Runtime', value: 'Tauri 2.11.3 (WebKit on macOS)' },
  { label: 'Engine', value: 'Rust (edition 2021, MSRV 1.77.2)' },
  { label: 'PDF Core', value: 'monapdfsa-core 0.2.0 (custom, built on lopdf 0.35.0)' },
  { label: 'PDF Render', value: 'pdfjs-dist 4.10.38' },
  { label: 'Icons', value: 'lucide-react 1.35.0' },
];
