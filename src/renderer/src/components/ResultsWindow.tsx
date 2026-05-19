import React, { useMemo, useState } from 'react';
import { fixGuides } from '../data/fixGuides';

type DiagnosticStatus = 'pending' | 'scanning' | 'passed' | 'warning' | 'critical';

type DiagnosticResult = {
  id: string;
  category: string;
  label: string;
  status: DiagnosticStatus;
  details: string;
  evidence?: string;
  impact?: string;
  recommendation?: string;
  severity?: string;
  rawOutput?: string;
  autoRepair?: { type: string; profile?: string };
  timestamp?: string;
};

type DiagnosticReport = {
  timestamp?: string;
  systemInfo?: {
    platform?: string;
    release?: string;
    arch?: string;
    cpus?: number;
    totalmem?: number;
  };
  appInfo?: { name?: string; path?: string };
  results?: DiagnosticResult[];
  summary?: {
    critical?: number;
    warning?: number;
    passed?: number;
    total?: number;
  };
};

interface ResultsWindowProps {
  report: DiagnosticReport;
  onRescan: () => void;
  onScanApp: (appPath: string) => void;
}

const ResultsWindow: React.FC<ResultsWindowProps> = ({ report, onRescan, onScanApp }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFixGuide, setShowFixGuide] = useState(false);
  const [filter, setFilter] = useState<DiagnosticStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [isRepairing, setIsRepairing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const results = report.results ?? [];
  const categories = useMemo(() => Array.from(new Set(results.map((result) => result.category))), [results]);
  const selectedItem = results.find((result) => result.id === selectedId) ?? null;
  const antiCheatResult = results.find((result) => result.id === 'protection-anti-cheat-runtime');

  const filteredResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return results.filter((item) => {
      const matchesFilter = filter === 'all' || item.status === filter;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const haystack = `${item.label} ${item.details} ${item.evidence ?? ''}`.toLowerCase();
      const matchesSearch = needle.length === 0 || haystack.includes(needle);
      return matchesFilter && matchesCategory && matchesSearch;
    });
  }, [categoryFilter, filter, results, search]);

  const filteredCategories = useMemo(
    () => categories.filter((category) => filteredResults.some((item) => item.category === category)),
    [categories, filteredResults]
  );

  const handleAutoRepair = async (repairInfo: NonNullable<DiagnosticResult['autoRepair']>, action: 'enable' | 'disable') => {
    if (repairInfo.type === 'restart-firmware') {
      const confirmed = window.confirm(
        'This will immediately restart Windows and open the BIOS/UEFI firmware setup on the next boot. Save your work and close other apps before continuing.'
      );
      if (!confirmed) return;
    }

    setIsRepairing(true);
    try {
      const response = await window.api.runAutoRepair({ ...repairInfo, action });
      if (response.success) {
        const suffix = repairInfo.type === 'restart-firmware' ? '' : '. Please rescan to verify the fix.';
        alert(`${getActionPastTense(repairInfo, action)}${suffix}`);
      } else {
        alert(`Action failed: ${response.error}`);
      }
    } catch (error) {
      alert(`Error executing action: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    setIsRepairing(false);
  };

  const handleScanExe = async () => {
    const appPath = await window.api.selectFile();
    if (appPath) onScanApp(appPath);
  };

  const handleCopyDetails = () => {
    if (!selectedItem) return;
    const detailText = [
      selectedItem.label,
      `Status: ${selectedItem.status}`,
      `Details: ${selectedItem.details}`,
      `Evidence: ${selectedItem.evidence ?? 'N/A'}`,
      `Impact: ${selectedItem.impact ?? 'N/A'}`,
      `Recommendation: ${selectedItem.recommendation ?? 'N/A'}`
    ].join('\n');
    void navigator.clipboard?.writeText(detailText);
  };

  return (
    <div className="results-layout animate-fade-in">
      <header className="results-header">
        <div>
          <span className="eyebrow">Diagnostic Summary</span>
          <h1>System Status</h1>
          <p>{report.appInfo?.name ? `Diagnostics for ${report.appInfo.name}` : 'System-wide diagnostic summary'}</p>
        </div>

        <div className="summary-strip" aria-label="Scan summary">
          <StatBox label="Critical" value={report.summary?.critical ?? 0} tone="critical" />
          <StatBox label="Warning" value={report.summary?.warning ?? 0} tone="warning" />
          <StatBox label="Passed" value={report.summary?.passed ?? 0} tone="passed" />
        </div>
      </header>

      <section className="status-banner">
        <div className={`status-banner-icon ${antiCheatResult?.status ?? 'passed'}`}>
          <StatusGlyph status={antiCheatResult?.status ?? 'passed'} />
        </div>
        <div>
          <strong>{antiCheatResult?.status === 'critical' ? 'Anti-cheat is currently active' : 'No active anti-cheat detected'}</strong>
          <span>{antiCheatResult?.details ?? 'Protection runtime check completed cleanly.'}</span>
        </div>
        <button type="button" className="icon-text-button" onClick={() => antiCheatResult && setSelectedId(antiCheatResult.id)}>
          <InfoIcon />
          Details
        </button>
      </section>

      <section className="results-toolbar" aria-label="Result filters">
        <input
          type="search"
          placeholder="Search components, evidence, or issues..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All Categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select value={filter} onChange={(event) => setFilter(event.target.value as DiagnosticStatus | 'all')}>
          <option value="all">All Results</option>
          <option value="critical">Critical Only</option>
          <option value="warning">Warnings Only</option>
          <option value="passed">Passed Only</option>
        </select>
      </section>

      <section className="results-table-shell">
        <div className="results-table-header">
          <div>Inspect</div>
          <div>Component</div>
          <div>State</div>
          <div>Details</div>
        </div>
        <div className="results-table-body">
          {filteredCategories.map((category) => (
            <React.Fragment key={category}>
              <div className="category-row">{category}</div>
              {filteredResults
                .filter((item) => item.category === category)
                .map((item) => (
                  <div key={item.id} className={`result-row ${selectedId === item.id ? 'selected' : ''}`}>
                    <button
                      type="button"
                      className={`status-trigger ${item.status}`}
                      aria-label={`Open ${item.label} details`}
                      onClick={() => setSelectedId(item.id)}
                      title="Open details"
                    >
                      <StatusGlyph status={item.status} />
                      <span>Details</span>
                    </button>
                    <div className="result-component">
                      <strong>{item.label}</strong>
                      <span>{item.severity ?? 'low'} severity</span>
                    </div>
                    <span className={`status-label ${item.status}`}>{item.status}</span>
                    <div className="result-details">{item.details}</div>
                  </div>
                ))}
            </React.Fragment>
          ))}
          {filteredResults.length === 0 ? <div className="empty-results">No results match the selected filters.</div> : null}
        </div>
      </section>

      <footer className="preflight-footer results-footer">
        <div className="footer-icon-cell">
          <ShieldSmallIcon />
        </div>
        <div className="footer-brand footer-brand-cell">
          <div>
            <strong>Aegis Troubleshooter</strong>
            <span>
              Scan completed <em /> {report.timestamp ? new Date(report.timestamp).toLocaleString() : 'Unknown time'}
            </span>
          </div>
        </div>
        <div className="footer-state-cell">Complete</div>
        <div className="footer-actions">
          <button type="button" className="secondary-action" onClick={handleScanExe}>
            <FolderIcon />
            Scan EXE
          </button>
          <button type="button" className="secondary-action" onClick={onRescan}>
            Rescan
          </button>
          <button type="button" className="primary-action small" onClick={() => void window.api.exportReport({ report, format: 'json' })}>
            Export Full
          </button>
        </div>
      </footer>

      <DetailDrawer
        item={selectedItem}
        onClose={() => setSelectedId(null)}
        onCopyDetails={handleCopyDetails}
        onOpenFixGuide={() => setShowFixGuide(true)}
      />

      {showFixGuide && selectedItem ? (
        <FixGuideView
          item={selectedItem}
          guide={getGuideForItem(selectedItem)}
          isRepairing={isRepairing}
          onAutoRepair={handleAutoRepair}
          onClose={() => setShowFixGuide(false)}
        />
      ) : null}
    </div>
  );
};

function DetailDrawer(props: {
  item: DiagnosticResult | null;
  onClose: () => void;
  onCopyDetails: () => void;
  onOpenFixGuide: () => void;
}) {
  const { item } = props;

  return (
    <aside className={`detail-drawer ${item ? 'open' : ''}`} aria-hidden={!item}>
      {item ? (
        <>
          <header className="drawer-header">
            <div>
              <span className="eyebrow">Component Details</span>
              <h2>{item.label}</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Close details" onClick={props.onClose}>
              <CloseIcon />
            </button>
          </header>

          <div className="drawer-content">
            <DetailField label="Status" value={item.status} color={`var(--tone-${statusTone(item.status)})`} uppercase />
            <DetailField label="Details" value={item.details} />
            <DetailField label="Evidence" value={item.evidence} />
            <DetailField label="Impact" value={item.impact} />
            <DetailField label="Recommendation" value={item.recommendation} />
          </div>

          <footer className="drawer-footer">
            <button type="button" className="primary-action" onClick={props.onOpenFixGuide}>
              Open Fix Guide
            </button>
            <button type="button" className="secondary-action" onClick={props.onCopyDetails}>
              Copy Details
            </button>
          </footer>
        </>
      ) : null}
    </aside>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: 'critical' | 'warning' | 'passed' }) {
  return (
    <div className={`stat-box ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DetailField({ label, value, color, uppercase }: { label: string; value?: string; color?: string; uppercase?: boolean }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong style={{ color, textTransform: uppercase ? 'uppercase' : 'none' }}>{value || 'N/A'}</strong>
    </div>
  );
}

function StatusGlyph({ status }: { status: DiagnosticStatus }) {
  if (status === 'passed') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === 'critical') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 3 2.8 16h14.4L10 3Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M10 7.5v4.2M10 14.4h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 6.3v4.3M10 13.8h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 6l8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 9.4v4.1M10 6.5h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function ShieldSmallIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5.5 5.3v5.2c0 4.4 2.6 8.3 6.5 10.1 3.9-1.8 6.5-5.7 6.5-10.1V5.3L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function statusTone(status: DiagnosticStatus): 'passed' | 'warning' | 'critical' | 'neutral' {
  if (status === 'passed') return 'passed';
  if (status === 'critical') return 'critical';
  if (status === 'warning') return 'warning';
  return 'neutral';
}

const FixGuideView = ({
  item,
  guide,
  isRepairing,
  onAutoRepair,
  onClose
}: {
  item: DiagnosticResult;
  guide: any;
  isRepairing: boolean;
  onAutoRepair: (repairInfo: NonNullable<DiagnosticResult['autoRepair']>, action: 'enable' | 'disable') => void;
  onClose: () => void;
}) => {
  const repairActions = getRepairActions(item);

  if (!guide) {
    return (
      <div className="modal-backdrop">
        <div className="fix-guide-modal compact">
          <h2>{item.label}</h2>
          <section>
            <h3>Recommended Fix</h3>
            <p>{item.recommendation || 'No guided fix is available for this result yet.'}</p>
          </section>
          <GuideActionPanel item={item} actions={repairActions} isRepairing={isRepairing} onAutoRepair={onAutoRepair} />
          <div className="modal-actions">
            <button type="button" className="secondary-action" onClick={onClose}>
              Close Guide
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="fix-guide-modal">
        <button type="button" className="icon-button modal-close" aria-label="Close guide" onClick={onClose}>
          <CloseIcon />
        </button>

        <h2>{guide.title}</h2>
        <div className="guide-badges">
          <Badge label={guide.riskLevel} tone={guide.riskLevel === 'safe' ? 'passed' : 'warning'} />
          <Badge label={guide.estimatedTime} tone="neutral" />
        </div>

        <section>
          <h3>Summary</h3>
          <p>{guide.plainEnglishSummary}</p>
        </section>

        <section>
          <h3>Current Status</h3>
          <p>{item.details}</p>
        </section>

        <section>
          <h3>Step-by-Step Fix</h3>
          <div className="guide-steps">
            {guide.recommendedFixes.map((step: any, index: number) => (
              <div key={`${step.title}-${index}`} className="guide-step">
                <span>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <GuideActionPanel item={item} actions={repairActions} isRepairing={isRepairing} onAutoRepair={onAutoRepair} />

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onClose}>
            I Followed These Steps
          </button>
        </div>
      </div>
    </div>
  );
};

function GuideActionPanel({
  item,
  actions,
  isRepairing,
  onAutoRepair
}: {
  item: DiagnosticResult;
  actions: Array<{ label: string; action: 'enable' | 'disable'; tone: 'primary' | 'secondary'; note: string }>;
  isRepairing: boolean;
  onAutoRepair: (repairInfo: NonNullable<DiagnosticResult['autoRepair']>, action: 'enable' | 'disable') => void;
}) {
  if (!item.autoRepair || actions.length === 0) {
    return (
      <section className="guide-action-panel">
        <h3>Action</h3>
        <p>{item.recommendation || 'This result requires a manual change. Review the current status and follow the guidance above.'}</p>
      </section>
    );
  }

  return (
    <section className="guide-action-panel">
      <h3>Apply Fix</h3>
      <p>{getRepairPrompt(item)}</p>
      <div className="guide-action-buttons">
        {actions.map((repairAction) => (
          <button
            type="button"
            key={`${item.id}-${repairAction.action}-${repairAction.label}`}
            className={repairAction.tone === 'primary' ? 'primary-action' : 'secondary-action'}
            disabled={isRepairing}
            title={repairAction.note}
            onClick={() => onAutoRepair(item.autoRepair!, repairAction.action)}
          >
            {isRepairing ? 'Working...' : repairAction.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function getRepairActions(item: DiagnosticResult): Array<{ label: string; action: 'enable' | 'disable'; tone: 'primary' | 'secondary'; note: string }> {
  const repair = item.autoRepair;
  if (!repair) return [];

  if (repair.type === 'defender-rtp') {
    return [
      { label: 'Enable Real-Time Protection', action: 'enable', tone: 'primary', note: 'Runs Set-MpPreference -DisableRealtimeMonitoring $false.' },
      { label: 'Temporarily Disable', action: 'disable', tone: 'secondary', note: 'Runs Set-MpPreference -DisableRealtimeMonitoring $true.' }
    ];
  }

  if (repair.type === 'defender-cloud-protection') {
    return [
      { label: 'Enable Cloud Protection', action: 'enable', tone: 'primary', note: 'Sets MAPSReporting to Advanced.' },
      { label: 'Disable Cloud Protection', action: 'disable', tone: 'secondary', note: 'Sets MAPSReporting to Disabled.' }
    ];
  }

  if (repair.type === 'defender-sample-submission') {
    return [
      { label: 'Enable Sample Submission', action: 'enable', tone: 'primary', note: 'Allows Defender to submit safe samples automatically.' },
      { label: 'Disable Sample Submission', action: 'disable', tone: 'secondary', note: 'Sets sample submission to never send.' }
    ];
  }

  if (repair.type === 'defender-pua-blocking') {
    return [
      { label: 'Enable PUA Blocking', action: 'enable', tone: 'primary', note: 'Enables potentially unwanted app blocking.' },
      { label: 'Disable PUA Blocking', action: 'disable', tone: 'secondary', note: 'Disables potentially unwanted app blocking.' }
    ];
  }

  if (repair.type === 'defender-network-protection') {
    return [
      { label: 'Enable Network Protection', action: 'enable', tone: 'primary', note: 'Enables Defender network protection.' },
      { label: 'Disable Network Protection', action: 'disable', tone: 'secondary', note: 'Disables Defender network protection.' }
    ];
  }

  if (repair.type === 'defender-controlled-folder-access') {
    return [
      { label: 'Enable Folder Access', action: 'enable', tone: 'primary', note: 'Enables Controlled Folder Access.' },
      { label: 'Disable Folder Access', action: 'disable', tone: 'secondary', note: 'Disables Controlled Folder Access.' }
    ];
  }

  if (repair.type === 'firewall') {
    const profile = repair.profile ? `${repair.profile} ` : '';
    return [
      { label: `Enable ${profile}Firewall`, action: 'enable', tone: 'primary', note: `Enables the ${profile || 'selected '}Windows Firewall profile.` },
      { label: `Disable ${profile}Firewall`, action: 'disable', tone: 'secondary', note: `Disables the ${profile || 'selected '}Windows Firewall profile.` }
    ];
  }

  if (repair.type === 'uac') {
    return [
      { label: 'Enable UAC', action: 'enable', tone: 'primary', note: 'Sets EnableLUA to 1. Windows may need a restart.' },
      { label: 'Disable UAC', action: 'disable', tone: 'secondary', note: 'Sets EnableLUA to 0. Windows may need a restart.' }
    ];
  }

  if (repair.type === 'install-vcpp') {
    return [{ label: 'Install Visual C++ Runtime', action: 'enable', tone: 'primary', note: 'Installs Microsoft.VCRedist.2015+.x64 through winget.' }];
  }

  if (repair.type === 'install-dotnet') {
    return [{ label: 'Install .NET Framework', action: 'enable', tone: 'primary', note: 'Installs Microsoft .NET Framework Developer Pack through winget.' }];
  }

  if (repair.type === 'install-python') {
    return [{ label: 'Install Python 3', action: 'enable', tone: 'primary', note: 'Installs Python 3.12 through winget.' }];
  }

  if (repair.type === 'restart-admin') {
    return [{ label: 'Restart as Administrator', action: 'enable', tone: 'primary', note: 'Restarts this troubleshooter with administrator privileges.' }];
  }

  if (repair.type === 'restart-firmware') {
    return [{ label: 'Restart to BIOS / UEFI', action: 'enable', tone: 'primary', note: 'Runs shutdown /r /fw /t 0 so Windows opens firmware setup on the next boot.' }];
  }

  if (repair.type.startsWith('install-')) {
    return [{ label: 'Install Required Component', action: 'enable', tone: 'primary', note: 'Runs the configured install action.' }];
  }

  return [{ label: 'Apply Fix', action: 'enable', tone: 'primary', note: 'Runs the configured repair action.' }];
}

function getRepairPrompt(item: DiagnosticResult): string {
  const type = item.autoRepair?.type;
  if (type === 'defender-rtp') {
    return 'Real-time protection changes are applied through Microsoft Defender PowerShell settings. Enabling is recommended unless you intentionally need a temporary test exception.';
  }
  if (type === 'defender-cloud-protection') {
    return 'Cloud-delivered protection uses Microsoft Defender cloud reputation. Enabling gives Defender newer threat intelligence; disabling can reduce detection quality.';
  }
  if (type === 'defender-sample-submission') {
    return 'Automatic sample submission sends suspicious samples to Microsoft for analysis based on Defender policy. Enable it for stronger cloud analysis, disable only for privacy-controlled environments.';
  }
  if (type === 'defender-pua-blocking') {
    return 'Potentially unwanted app blocking can stop bundled installers and low-reputation software. Enable for safer defaults, disable only when testing trusted installers that are being blocked.';
  }
  if (type === 'defender-network-protection') {
    return 'Network protection can block connections to known malicious hosts. Enable for stronger protection, disable only for controlled network troubleshooting.';
  }
  if (type === 'defender-controlled-folder-access') {
    return 'Controlled Folder Access can block unauthorized writes to protected folders. Enable for ransomware protection, or disable/add allow-list entries if a trusted app is being blocked.';
  }
  if (type === 'firewall') {
    return 'Firewall profile changes are applied through Windows Firewall. Disabling a profile can expose the machine on that network, so only do that for controlled testing.';
  }
  if (type === 'uac') {
    return 'UAC changes affect Windows elevation prompts and usually need a restart before the system fully reflects the change.';
  }
  if (type === 'install-vcpp' || type === 'install-dotnet' || type === 'install-python') {
    return 'The installer action uses winget and may request administrator approval. Run a rescan afterward to confirm the runtime is detected.';
  }
  if (type === 'restart-admin') {
    return 'Some checks need administrator rights. Restarting as administrator closes this window and opens an elevated copy.';
  }
  if (type === 'restart-firmware') {
    return 'This cannot change firmware values automatically. It uses the Windows firmware restart command, then you choose the BIOS/UEFI setting manually and save changes before Windows boots again.';
  }
  return 'This action may request administrator approval. Run a rescan afterward to verify the result.';
}

function getGuideForItem(item: DiagnosticResult) {
  const exactGuide = fixGuides[item.id];
  if (exactGuide) return exactGuide;

  return {
    title: item.label,
    plainEnglishSummary: item.status === 'passed'
      ? `${item.label} is currently passing. No change is recommended unless a specific app requirement says otherwise.`
      : item.details,
    whyItMatters: item.impact || 'This setting can affect whether an app launches, updates, connects, or runs with the expected security posture.',
    recommendedFixes: getManualSteps(item),
    riskLevel: item.autoRepair?.type === 'restart-firmware'
      ? 'advanced'
      : item.severity === 'critical' || item.severity === 'high' ? 'advanced' : item.severity === 'medium' ? 'moderate' : 'safe',
    estimatedTime: item.autoRepair?.type === 'restart-firmware' ? '5-10 minutes' : item.autoRepair ? '1-2 minutes' : '2-5 minutes'
  };
}

function getManualSteps(item: DiagnosticResult): Array<{ title: string; description: string }> {
  const id = item.id;
  const repairType = item.autoRepair?.type;

  if (repairType === 'defender-rtp') {
    return [
      { title: 'Open Windows Security', description: 'Open Start, search for Windows Security, then open Virus & threat protection.' },
      { title: 'Manage Protection Settings', description: 'Select Manage settings under Virus & threat protection settings.' },
      { title: 'Toggle Real-Time Protection', description: 'Turn Real-time protection on or off. Turning it off should only be temporary and may automatically re-enable.' },
      { title: 'Rescan', description: 'Return to Aegis Troubleshooter and rescan to confirm the detected state changed.' }
    ];
  }

  if (repairType?.startsWith('defender-')) {
    return [
      { title: 'Open Windows Security', description: 'Open Start, search for Windows Security, then open App & browser control or Virus & threat protection depending on the setting.' },
      { title: 'Open the Matching Settings Page', description: `Find the control related to ${item.label}. The current detected state is: ${item.details}` },
      { title: 'Apply the Change', description: item.recommendation || 'Enable or disable the setting based on the application requirement you are testing.' },
      { title: 'Rescan', description: 'Run the troubleshooter again so the result updates from Windows rather than from memory.' }
    ];
  }

  if (repairType === 'firewall') {
    return [
      { title: 'Open Firewall Settings', description: 'Open Windows Security, select Firewall & network protection, then choose the Domain, Private, or Public profile shown in this result.' },
      { title: 'Change the Profile State', description: 'Toggle Microsoft Defender Firewall for that profile. Disabling is only recommended for controlled testing on a trusted network.' },
      { title: 'Confirm Network Profile', description: 'Make sure you changed the same profile listed in the result evidence.' },
      { title: 'Rescan', description: 'Return to Aegis Troubleshooter and rescan to verify the profile state.' }
    ];
  }

  if (repairType === 'uac') {
    return [
      { title: 'Open UAC Settings', description: 'Open Start, search for Change User Account Control settings, and open it.' },
      { title: 'Choose Prompt Level', description: 'Move the slider to the required level. The default recommended value is Notify me only when apps try to make changes to my computer.' },
      { title: 'Restart if Needed', description: 'Some UAC registry changes do not fully apply until Windows restarts.' },
      { title: 'Rescan', description: 'Run the troubleshooter again after the change or restart.' }
    ];
  }

  if (repairType === 'install-vcpp') {
    return [
      { title: 'Install the x64 Runtime', description: 'Use the Install Visual C++ Runtime button or download Microsoft Visual C++ 2015-2022 Redistributable x64 from Microsoft.' },
      { title: 'Complete the Installer', description: 'Accept the installer prompts. If it offers Repair instead of Install, choose Repair.' },
      { title: 'Restart the App', description: 'Close and reopen the app that needed the runtime.' },
      { title: 'Rescan', description: 'Run Aegis Troubleshooter again to confirm vcruntime140.dll is present.' }
    ];
  }

  if (repairType === 'install-dotnet') {
    return [
      { title: 'Install .NET Framework', description: 'Use the Install .NET Framework button or install .NET Framework 4.8 or newer from Microsoft.' },
      { title: 'Finish Windows Setup', description: 'Allow the installer to complete any Windows component setup it requests.' },
      { title: 'Restart if Prompted', description: 'Restart Windows if the installer requests it.' },
      { title: 'Rescan', description: 'Run the troubleshooter again and confirm the .NET release key is detected.' }
    ];
  }

  if (repairType === 'install-python') {
    return [
      { title: 'Install Python 3', description: 'Use the Install Python 3 button or install Python 3.12 or newer from python.org.' },
      { title: 'Add Python to PATH', description: 'If using the python.org installer, check Add python.exe to PATH before installing.' },
      { title: 'Restart the Troubleshooter', description: 'Close and reopen the troubleshooter so PATH changes are visible.' },
      { title: 'Rescan', description: 'Run the scan again to verify py, python, or python3 resolves.' }
    ];
  }

  if (id === 'cpu-virtualization-firmware') {
    return [
      { title: 'Save Work First', description: 'BIOS/UEFI changes require a restart. Save open files, close apps, and make sure BitLocker recovery information is available if the PC uses BitLocker.' },
      { title: 'Open Firmware Setup', description: 'Use Restart to BIOS / UEFI, or go to Windows Settings > System > Recovery > Advanced startup > Restart now > Troubleshoot > Advanced options > UEFI Firmware Settings > Restart.' },
      { title: 'Find CPU Virtualization', description: 'Look under Advanced, CPU Configuration, Security, Overclocking, or System Configuration. Intel boards often call it Intel Virtualization Technology, VT-x, or VMX. AMD boards often call it SVM Mode, AMD-V, or Secure Virtual Machine.' },
      { title: 'Enable the Hardware Layer', description: 'Set VT-x, VMX, SVM Mode, or AMD-V to Enabled. Do not confuse this with Hyper-V, Virtual Machine Platform, VBS, or Memory Integrity; those are Windows layers that sit above this firmware setting.' },
      { title: 'Save, Exit, and Rescan', description: 'Use Save & Exit, commonly F10, let Windows boot normally, then run the troubleshooter again. Task Manager > Performance > CPU should also show Virtualization: Enabled.' }
    ];
  }

  if (id === 'cpu-vm-monitor-extensions') {
    return [
      { title: 'Check Hardware Support', description: 'VM monitor extensions are CPU capabilities. Firmware can expose or hide them, but it cannot add them to a CPU that does not support virtualization.' },
      { title: 'Open BIOS/UEFI', description: 'Use Restart to BIOS / UEFI, or use Windows advanced startup and select UEFI Firmware Settings.' },
      { title: 'Enable Virtualization Terms', description: 'Enable Intel Virtualization Technology, VT-x, VMX, AMD SVM Mode, AMD-V, or Secure Virtual Machine if present.' },
      { title: 'Update Firmware if Missing', description: 'If the option is not visible, check the motherboard or laptop support page for BIOS updates and confirm the CPU model supports hardware virtualization.' },
      { title: 'Save and Rescan', description: 'Save firmware changes, boot Windows, and rescan. If the result stays unavailable on supported hardware, the system vendor may be hiding the feature.' }
    ];
  }

  if (id === 'iommu-dma-remapping') {
    return [
      { title: 'Understand the Layer', description: 'IOMMU is separate from basic VT-x/AMD-V. It is the DMA remapping layer used for VT-d, AMD-Vi, device isolation, some passthrough workflows, and Kernel DMA Protection.' },
      { title: 'Enter BIOS/UEFI', description: 'Use Restart to BIOS / UEFI, or open Windows Settings > System > Recovery > Advanced startup > Restart now > Troubleshoot > Advanced options > UEFI Firmware Settings.' },
      { title: 'Find DMA Remapping', description: 'Intel systems usually label this Intel VT-d, VT-d, DMA Remapping, or IOMMU. AMD systems usually label it IOMMU, AMD-Vi, or sometimes Advanced IOMMU. It is often under Advanced, Chipset, North Bridge, PCIe, or Security.' },
      { title: 'Enable Related Prerequisites', description: 'If there are separate controls, leave CPU virtualization/SVM enabled as well. Some systems require Above 4G Decoding or SR-IOV for passthrough scenarios, but those are not the same as IOMMU.' },
      { title: 'Save and Verify in Windows', description: 'Save & Exit firmware setup, boot Windows, then rescan. For DMA protection specifically, Windows Security > Device security may also show Kernel DMA Protection when supported.' }
    ];
  }

  if (id === 'vbs-hyper-v-dma-protection') {
    return [
      { title: 'Check Firmware Prerequisites', description: 'Kernel DMA Protection depends on UEFI, IOMMU/VT-d/AMD-Vi, and platform firmware support. It is related to VBS and Hyper-V, but it is not the same setting as Memory Integrity.' },
      { title: 'Enter BIOS/UEFI', description: 'Use Restart to BIOS / UEFI or Windows Advanced startup > UEFI Firmware Settings.' },
      { title: 'Enable IOMMU / DMA Remapping', description: 'Look for Intel VT-d, DMA Remapping, IOMMU, or AMD-Vi and enable it. On laptops, also check Thunderbolt or external port security options when available.' },
      { title: 'Leave Secure Boot/UEFI Enabled', description: 'Do not switch the machine to legacy boot/CSM. Kernel DMA Protection requires modern UEFI behavior and supported firmware tables.' },
      { title: 'Save and Rescan', description: 'Save firmware changes, boot Windows, and rescan. If it still reports disabled, the hardware or firmware may not expose Kernel DMA Protection even when virtualization is enabled.' }
    ];
  }

  if (id === 'secure-boot') {
    return [
      { title: 'Save Recovery Information', description: 'Before changing Secure Boot settings, save work and make sure BitLocker recovery keys are available. Changing boot security settings can trigger BitLocker recovery on some systems.' },
      { title: 'Enter UEFI Firmware Setup', description: 'Use Restart to BIOS / UEFI, or open Windows Settings > System > Recovery > Advanced startup > Restart now > Troubleshoot > Advanced options > UEFI Firmware Settings > Restart.' },
      { title: 'Confirm UEFI Boot Mode', description: 'Secure Boot requires UEFI boot. If the system is using Legacy or CSM boot, do not switch modes blindly; Windows may fail to boot if it was installed in legacy mode.' },
      { title: 'Enable Secure Boot', description: 'Look under Boot, Security, Authentication, or Windows OS Configuration. Enable Secure Boot, choose Standard or Windows UEFI mode when offered, and install or restore default Secure Boot keys if the firmware says keys are missing.' },
      { title: 'Save and Rescan', description: 'Use Save & Exit, let Windows boot, then rescan. If Secure Boot remains unavailable, update motherboard/laptop firmware and check whether the disk and Windows install are configured for UEFI/GPT.' }
    ];
  }

  if (id === 'core-firmware-memory-access-protection') {
    return [
      { title: 'Check the Windows Layer First', description: 'Open Windows Security > Device security > Core isolation details. Firmware and memory access protection depends on Windows support plus firmware-exposed hardware protections.' },
      { title: 'Enter BIOS/UEFI if Missing', description: 'Use Restart to BIOS / UEFI if Windows does not expose the protection or reports firmware prerequisites missing.' },
      { title: 'Enable Hardware Security Prerequisites', description: 'Look for UEFI mode, Secure Boot, TPM/PTT/fTPM, Intel VT-d, AMD-Vi, IOMMU, DMA remapping, and Thunderbolt security options. Names vary by vendor and may be under Security, Advanced, Chipset, or Boot.' },
      { title: 'Update Firmware When Options Are Missing', description: 'Some systems only expose memory access protections after a BIOS update. If the options are absent, check the motherboard or laptop vendor support page.' },
      { title: 'Save, Boot, and Rescan', description: 'Save firmware changes, boot Windows normally, then run the scan again. If the hardware does not support the protection, the result may remain unavailable even after firmware changes.' }
    ];
  }

  if (id === 'system-tpm') {
    return [
      { title: 'Do Not Clear TPM', description: 'The fix is normally to enable or activate TPM, not clear it. Clearing TPM can affect BitLocker and saved credentials, so only clear it when you intentionally have recovery keys and know why.' },
      { title: 'Open BIOS/UEFI', description: 'Use Restart to BIOS / UEFI, or go through Windows Settings > System > Recovery > Advanced startup > UEFI Firmware Settings.' },
      { title: 'Find TPM Controls', description: 'Intel systems often call this Intel PTT, Platform Trust Technology, TPM Device Selection, or Security Device. AMD systems often call it AMD fTPM, Firmware TPM, or Security Processor. It is usually under Security, Trusted Computing, or Advanced.' },
      { title: 'Enable and Activate', description: 'Set TPM, fTPM, PTT, or Security Device Support to Enabled. If there is a separate Activate option, enable that too. Prefer firmware TPM unless your machine has a discrete TPM module installed.' },
      { title: 'Save, Boot, and Confirm', description: 'Save & Exit, boot Windows, and rescan. Windows Security > Device security > Security processor details should also show TPM information when it is ready.' }
    ];
  }

  if (item.category === 'Virtualization Layers') {
    return [
      { title: 'Identify the Layer', description: 'CPU virtualization, IOMMU/VT-d, Hyper-V, VBS, Memory Integrity, and GPU-P are separate layers. Read the evidence to see which layer this row represents.' },
      { title: 'Use Firmware for Hardware Toggles', description: 'VT-x, AMD-V, VT-d, AMD-Vi, and IOMMU are usually enabled in BIOS/UEFI, not inside Windows.' },
      { title: 'Use Windows Features for Hyper-V Layers', description: 'Hyper-V, Virtual Machine Platform, and Windows Hypervisor Platform are managed in Turn Windows features on or off.' },
      { title: 'Use Windows Security for VBS/HVCI', description: 'Memory Integrity and some isolation features live under Windows Security > Device security > Core isolation.' },
      { title: 'Restart and Rescan', description: 'Virtualization changes usually require a full Windows restart before they report correctly.' }
    ];
  }

  if (item.category === 'Core Isolation') {
    return [
      { title: 'Open Device Security', description: 'Open Windows Security, select Device security, then open Core isolation details.' },
      { title: 'Find the Matching Setting', description: `Look for ${item.label}. The troubleshooter currently reports: ${item.details}` },
      { title: 'Apply the Required State', description: item.recommendation || 'Enable or disable the setting according to the app requirement.' },
      { title: 'Restart and Rescan', description: 'Most core isolation changes require a restart before the status updates.' }
    ];
  }

  if (item.category === 'Reputation Protection') {
    return [
      { title: 'Open App & Browser Control', description: 'Open Windows Security and select App & browser control.' },
      { title: 'Open Reputation-Based Protection', description: 'Select Reputation-based protection settings.' },
      { title: 'Match the Result Row', description: `Find ${item.label} and apply the required state. Current result: ${item.details}` },
      { title: 'Rescan', description: 'Run Aegis Troubleshooter again after changing the setting.' }
    ];
  }

  return [
    { title: 'Review Current Status', description: item.details },
    { title: 'Check Evidence', description: item.evidence || 'No additional evidence was returned by Windows.' },
    { title: 'Apply Recommendation', description: item.recommendation || 'No specific recommendation was provided for this result.' },
    { title: 'Rescan', description: 'Run the troubleshooter again to confirm the state after making changes.' }
  ];
}

function getActionPastTense(repairInfo: NonNullable<DiagnosticResult['autoRepair']>, action: 'enable' | 'disable'): string {
  if (repairInfo.type.startsWith('install-')) return 'Install command executed successfully';
  if (repairInfo.type === 'restart-admin') return 'Administrator restart command executed successfully';
  if (repairInfo.type === 'restart-firmware') return 'Firmware restart command sent successfully';
  return `${action === 'enable' ? 'Enable' : 'Disable'} command executed successfully`;
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M2.8 6.2c0-1 .8-1.8 1.8-1.8h3l1.5 1.8h6.3c1 0 1.8.8 1.8 1.8v5.7c0 1-.8 1.8-1.8 1.8H4.6c-1 0-1.8-.8-1.8-1.8V6.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={`guide-badge ${tone}`}>{label}</span>;
}

export default ResultsWindow;
