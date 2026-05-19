export type DiagnosticStatus = 'pending' | 'checking' | 'scanning' | 'passed' | 'warning' | 'critical';

export interface DiagnosticItem {
  id: string;
  label: string;
  status: DiagnosticStatus;
  details?: string;
  evidence?: string;
  impact?: string;
  fix?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export const initialScanItems: DiagnosticItem[] = [
  { id: 'antivirus', label: 'Windows Antivirus', status: 'pending' },
  { id: 'firewall', label: 'Windows Firewall', status: 'pending' },
  { id: 'app-control', label: 'App Control Settings', status: 'pending' },
  { id: 'secure-boot', label: 'Secure Boot', status: 'pending' },
  { id: 'fast-boot', label: 'Fast Boot', status: 'pending' },
  { id: 'uac', label: 'UAC Status', status: 'pending' },
  { id: 'vtd', label: 'VT-D Status', status: 'pending' },
  { id: 'hyperv', label: 'Hyper-V Status', status: 'pending' },
  { id: 'internet', label: 'Internet Status', status: 'pending' },
  { id: 'win-version', label: 'Windows Version', status: 'pending' },
  { id: 'win-build', label: 'Windows Build', status: 'pending' },
  { id: 'win-edition', label: 'Windows Edition', status: 'pending' },
  { id: 'win-arch', label: 'OS Bit Rate', status: 'pending' },
  { id: 'cpp-runtime', label: 'C++ Runtime', status: 'pending' },
  { id: 'dotnet', label: '.NET Framework', status: 'pending' },
];

export const mockResults: Record<string, Partial<DiagnosticItem>> = {
  'antivirus': { status: 'critical', details: 'Real-time protection is disabled.' },
  'firewall': { status: 'critical', details: 'Firewall is turned off.' },
  'app-control': { status: 'warning', details: 'SmartScreen is set to Warn.' },
  'vtd': { status: 'warning', details: 'VT-x/AMD-V is disabled in BIOS.' },
  'secure-boot': { status: 'passed', details: 'Secure Boot is enabled.' },
  'fast-boot': { status: 'passed', details: 'Fast Boot is enabled.' },
  'uac': { status: 'passed', details: 'User Account Control is enabled.' },
  'hyperv': { status: 'passed', details: 'Hyper-V is not interfering.' },
  'internet': { status: 'passed', details: 'Internet connection is active.' },
  'win-version': { status: 'passed', details: 'Windows 11 Pro.' },
  'win-build': { status: 'passed', details: 'Build 22631.3527.' },
  'win-edition': { status: 'passed', details: 'Windows 11 Pro.' },
  'win-arch': { status: 'passed', details: '64-bit Operating System.' },
  'cpp-runtime': { status: 'passed', details: 'All required runtimes installed.' },
  'dotnet': { status: 'passed', details: '.NET Framework 4.8 installed.' },
};
