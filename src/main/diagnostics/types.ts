export type DiagnosticStatus = 'pending' | 'scanning' | 'passed' | 'warning' | 'critical';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface DiagnosticResult {
  id: string;
  category: string;
  label: string;
  status: DiagnosticStatus;
  details: string;
  evidence: string;
  impact: string;
  recommendation: string;
  severity: Severity;
  rawOutput?: string;
  autoRepair?: any;
  timestamp: string;
}

export interface Scanner {
  id: string;
  name: string;
  run(context?: ScanContext): Promise<DiagnosticResult[]>;
}

export interface ScanContext {
  appPath?: string;
  isDevMode: boolean;
  onProgress: (progress: number, message: string) => void;
}

export interface FullReport {
  timestamp: string;
  systemInfo: any;
  appInfo?: any;
  results: DiagnosticResult[];
  summary: {
    critical: number;
    warning: number;
    passed: number;
    total: number;
  };
}
