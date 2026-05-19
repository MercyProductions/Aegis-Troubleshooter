import type { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      selectFile: () => Promise<string | null>;
      runDiagnostics: (params: { appPath?: string | null; isDevMode: boolean }) => Promise<any>;
      cancelScan: () => void;
      exportReport: (params: { report: any; format: 'txt' | 'json' | 'html' }) => Promise<boolean>;
      onScanProgress: (callback: (value: { progress: number; message: string }) => void) => void;
      removeScanListeners: () => void;
      runAutoRepair: (params: { type: string; profile?: string; action: 'enable' | 'disable' }) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export {};
