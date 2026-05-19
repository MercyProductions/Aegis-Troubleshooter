import React from 'react';

const TitleBar: React.FC = () => {
  return (
    <div className="titlebar draggable">
      <div className="titlebar-brand">
        <span className="titlebar-mark" />
        <span>Aegis System Troubleshooter</span>
      </div>
      
      <div className="window-controls non-draggable">
        <button type="button" aria-label="Minimize" onClick={() => (window as any).electron.ipcRenderer.send('window-minimize')}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 9h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" aria-label="Close" onClick={() => (window as any).electron.ipcRenderer.send('window-close')}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6 6l8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
