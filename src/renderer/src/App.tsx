import { useState } from 'react';
import TitleBar from './components/TitleBar';
import ScanWindow from './components/ScanWindow';
import ResultsWindow from './components/ResultsWindow';
import './styles/global.css';

type AppState = 'scanning' | 'results';

function App() {
  const [state, setState] = useState<AppState>('scanning');
  const [report, setReport] = useState<any>(null);
  const [scanTarget, setScanTarget] = useState<string | null>(null);

  const handleScanComplete = (finalReport: any) => {
    setReport(finalReport);
    setState('results');
    (window as any).electron.ipcRenderer.send('resize-window', { width: 1120, height: 760 });
  };

  const handleRescan = () => {
    setScanTarget(null);
    setState('scanning');
    setReport(null);
    (window as any).electron.ipcRenderer.send('resize-window', { width: 1120, height: 760 });
  };

  const handleScanApp = (appPath: string) => {
    setScanTarget(appPath);
    setState('scanning');
    setReport(null);
    (window as any).electron.ipcRenderer.send('resize-window', { width: 1120, height: 760 });
  };

  return (
    <main className={`troubleshooter-shell ${state === 'results' ? 'results-mode' : 'scan-mode'}`}>
      <TitleBar />

      <div className="atmosphere" aria-hidden="true">
        <span className="particle p1" />
        <span className="particle p2" />
        <span className="particle p3" />
        <span className="wave wave-one" />
        <span className="wave wave-two" />
      </div>

      <section className="troubleshooter-content">
        {state === 'scanning' ? (
          <ScanWindow onComplete={handleScanComplete} initialAppPath={scanTarget} />
        ) : (
          report && <ResultsWindow report={report} onRescan={handleRescan} onScanApp={handleScanApp} />
        )}
      </section>
    </main>
  );
}

export default App;
