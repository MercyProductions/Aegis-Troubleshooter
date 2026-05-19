import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import aegisLogo from '../../../../assets/BlueAegisLogo.png';

interface ScanWindowProps {
  onComplete: (results: any) => void;
  initialAppPath?: string | null;
}

const scanSteps = [
  { id: 'wininfo', label: 'Environment', key: 'Windows Info', detail: 'Windows, CPU, memory, and build data' },
  { id: 'virtualization', label: 'Virtualization', key: 'Virtualization', detail: 'VT-x, Hyper-V, VBS, DMA, and GPU-P' },
  { id: 'security', label: 'Security', key: 'Security', detail: 'Defender, firewall, and UAC state' },
  { id: 'runtime', label: 'Runtimes', key: 'Runtime', detail: 'Visual C++ and .NET readiness' },
  { id: 'permissions', label: 'Permissions', key: 'Permissions', detail: 'Admin context and filesystem access' },
  { id: 'network', label: 'Network', key: 'Network', detail: 'Connectivity and DNS resolution' },
  { id: 'protection', label: 'Protection', key: 'Protection', detail: 'Anti-cheat and protection processes' },
  { id: 'app', label: 'Application', key: 'Application', detail: 'Selected executable analysis' },
  { id: 'requirements', label: 'Requirements', key: 'Requirements', detail: 'Developer config and plugin rules' }
];

const ScanWindow: React.FC<ScanWindowProps> = ({ onComplete, initialAppPath = null }) => {
  const [appPath] = useState<string | null>(initialAppPath);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Starting diagnostic scan...');
  const [isScanning, setIsScanning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [showScanLine, setShowScanLine] = useState(true);
  const startedRef = useRef(false);

  useEffect(() => {
    window.api.onScanProgress(({ progress, message }) => {
      setProgress(progress);
      setMessage(message);

      const stepIndex = scanSteps.findIndex((step) => message.includes(step.key));
      if (stepIndex !== -1) {
        const nextStep = scanSteps[stepIndex];
        if (nextStep.id === 'app' && !appPath) return;
        const visibleIndex = scanSteps
          .filter((step) => step.id !== 'app' || appPath)
          .findIndex((step) => step.id === nextStep.id);
        if (visibleIndex !== -1) setCurrentStepIndex(visibleIndex);
      } else if (progress === 100) {
        setCurrentStepIndex(scanSteps.filter((step) => step.id !== 'app' || appPath).length);
      }
    });

    return () => {
      window.api.removeScanListeners();
    };
  }, [appPath]);

  const visibleSteps = useMemo(() => scanSteps.filter((step) => step.id !== 'app' || appPath), [appPath]);
  const activeStep = visibleSteps[Math.min(Math.max(currentStepIndex, 0), visibleSteps.length - 1)] ?? visibleSteps[0];
  const scanChecks = useMemo(() => buildScanChecks(visibleSteps, currentStepIndex, appPath), [appPath, currentStepIndex, visibleSteps]);
  const midpoint = Math.ceil(scanChecks.length / 2);
  const logLine = buildScanLogLine(appPath, message, progress, activeStep?.label ?? 'System');

  const handleStartScan = useCallback(async () => {
    setIsScanning(true);
    setCurrentStepIndex(0);
    setProgress(0);
    setMessage('Starting diagnostic scan...');

    try {
      const results = await window.api.runDiagnostics({ appPath, isDevMode: false });
      onComplete(results);
    } catch (error) {
      console.error(error);
      setIsScanning(false);
      setMessage(error instanceof Error ? error.message : 'Diagnostic scan failed.');
    }
  }, [appPath, onComplete]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const timer = window.setTimeout(() => {
      void handleStartScan();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [handleStartScan]);

  return (
    <div className="scan-layout animate-fade-in">
      <section className="scan-hero">
        <img className="aegis-mark" src={aegisLogo} alt="Aegis" />
        <div className="status-copy">
          <h1>{isScanning ? 'Scanning System' : 'Aegis System Troubleshooter'}</h1>
          <p>{isScanning ? message : 'Verify launch blockers, runtimes, protection services, and app health.'}</p>
        </div>
      </section>

      <section className="progress-section" aria-label="Diagnostic progress">
        <div className="progress-row">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.max(progress, isScanning ? 6 : 0)}%` }} />
          </div>
          <strong>{Math.round(progress)}%</strong>
        </div>

        <div className="step-rail troubleshooting-steps" style={{ gridTemplateColumns: `repeat(${visibleSteps.length}, minmax(0, 1fr))` }}>
          {visibleSteps.map((step, index) => (
            <StepIndicator key={step.id} step={step} index={index} currentIndex={currentStepIndex} />
          ))}
        </div>
      </section>

      <section className="environment-panel scan-check-panel" aria-label="Live diagnostic checks">
        <div className="checks-column">
          {scanChecks.slice(0, midpoint).map((check) => <ScanCheckRow key={check.label} check={check} />)}
        </div>
        <div className="panel-divider" />
        <div className="checks-column">
          {scanChecks.slice(midpoint).map((check) => <ScanCheckRow key={check.label} check={check} />)}
        </div>
      </section>

      {showScanLine ? <div className="scan-log-strip">{logLine}</div> : null}

      <footer className="preflight-footer scan-footer">
        <div className="footer-brand">
          <ShieldIcon />
          <div>
            <strong>Aegis Troubleshooter</strong>
            <span>
              Automatic diagnostics <em /> Local system scan
            </span>
          </div>
        </div>
        <button type="button" className="logs-button" onClick={() => setShowScanLine((value) => !value)}>
          <DocumentIcon />
          Scan Details
        </button>
        <div className="footer-status">
          <LockIcon />
          <span>{isScanning ? 'Scanning active' : 'Ready'}</span>
          <i className={isScanning ? 'status-dot warning' : 'status-dot'} />
        </div>
      </footer>
    </div>
  );
};

function StepIndicator(props: { step: (typeof scanSteps)[number]; index: number; currentIndex: number }) {
  const state = props.index < props.currentIndex ? 'complete' : props.index === props.currentIndex ? 'active' : 'future';

  return (
    <div className={`step-item ${state}`}>
      {props.index > 0 ? <span className={`step-line ${props.index <= props.currentIndex ? 'filled' : ''}`} /> : null}
      <div className="step-node">
        {state === 'complete' ? <CheckIcon /> : state === 'active' ? <PulseIcon /> : <StepIcon id={props.step.id} />}
      </div>
      <span>{props.step.label}</span>
    </div>
  );
}

type ScanCheckTone = 'healthy' | 'active' | 'pending';

type ScanCheck = {
  label: string;
  value: string;
  tone: ScanCheckTone;
  icon: React.ReactNode;
};

function buildScanChecks(steps: typeof scanSteps, currentIndex: number, appPath: string | null): ScanCheck[] {
  return steps.map((step, index) => {
    const state = getStepState(index, currentIndex);
    const tone: ScanCheckTone = state === 'complete' ? 'healthy' : state === 'active' ? 'active' : 'pending';
    return {
      label: step.label,
      value: state === 'complete' ? 'Checked' : state === 'active' ? 'Scanning' : 'Pending',
      tone,
      icon: <StepIcon id={step.id} />
    };
  }).concat(appPath ? [] : [{
    label: 'Application Target',
    value: 'System Scan',
    tone: 'healthy' as const,
    icon: <FolderIcon />
  }]);
}

function getStepState(index: number, currentIndex: number): 'complete' | 'active' | 'future' {
  if (index < currentIndex) return 'complete';
  if (index === currentIndex) return 'active';
  return 'future';
}

function buildScanLogLine(appPath: string | null, message: string, progress: number, activeLabel: string) {
  const target = appPath ? `target ${appPath}` : 'system-wide scan';
  return `${target}. ${Math.round(progress)}% complete. ${activeLabel}: ${message}`;
}

function ScanCheckRow({ check }: { check: ScanCheck }) {
  return (
    <div className={`check-row ${check.tone}`}>
      <span className="check-icon">{check.icon}</span>
      <span>{check.label}</span>
      <strong className={check.tone}>{check.value}</strong>
      {check.tone === 'healthy' ? <CheckCircleIcon /> : check.tone === 'active' ? <PulseIcon /> : <PendingIcon />}
    </div>
  );
}

function StepIcon({ id }: { id: string }) {
  if (id === 'wininfo') return <ShieldIconBase compact />;
  if (id === 'virtualization') return <CpuIcon />;
  if (id === 'security') return <LockIcon />;
  if (id === 'runtime') return <GearIcon />;
  if (id === 'permissions') return <KeyIcon />;
  if (id === 'network') return <WifiIcon />;
  if (id === 'protection') return <ShieldCheckIcon />;
  if (id === 'app') return <FolderIcon />;
  return <DocumentIcon />;
}

function ShieldIcon() {
  return <ShieldIconBase />;
}

function ShieldIconBase({ compact = false }: { compact?: boolean }) {
  return (
    <svg width={compact ? '18' : '20'} height={compact ? '18' : '20'} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3 5.5 5.3v5.2c0 4.4 2.6 8.3 6.5 10.1 3.9-1.8 6.5-5.7 6.5-10.1V5.3L12 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg className="row-state healthy" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m6.5 10.2 2.2 2.1 4.8-4.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg className="row-state active" width="19" height="19" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 10h3l1.8-4 3.4 8L13 10h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg className="row-state pending" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.6v3.7l2.3 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CpuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="5.2" y="5.2" width="9.6" height="9.6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.6 2.8v2.4m4.8-2.4v2.4M7.6 14.8v2.4m4.8-2.4v2.4M2.8 7.6h2.4m9.6 0h2.4M2.8 12.4h2.4m9.6 0h2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2.8v2M10 15.2v2M4.9 4.9l1.4 1.4m7.4 7.4 1.4 1.4M2.8 10h2m10.4 0h2M4.9 15.1l1.4-1.4m7.4-7.4 1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="7.2" cy="10.2" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.2 10.2h6.2m-2.1 0v2m-2.2-2v1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 7.3a10 10 0 0 1 13 0M6.2 10a5.9 5.9 0 0 1 7.6 0M8.8 12.7a2 2 0 0 1 2.4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="15" r=".8" fill="currentColor" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return <ShieldIconBase compact />;
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.8 6.2c0-1 .8-1.8 1.8-1.8h3l1.5 1.8h6.3c1 0 1.8.8 1.8 1.8v5.7c0 1-.8 1.8-1.8 1.8H4.6c-1 0-1.8-.8-1.8-1.8V6.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.2 2.8h6.1l3.5 3.5v10.9H5.2V2.8Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11.2 2.9v3.5h3.5M7.5 9.2h5M7.5 12h5M7.5 14.8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default ScanWindow;
