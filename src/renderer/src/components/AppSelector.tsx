import React from 'react';

interface AppSelectorProps {
  onSelect: (path: string | null) => void;
  selectedPath: string | null;
  disabled?: boolean;
}

const AppSelector: React.FC<AppSelectorProps> = ({ onSelect, selectedPath, disabled }) => {
  const handleSelect = async () => {
    const path = await window.api.selectFile();
    if (path) onSelect(path);
  };

  return (
    <div className="app-selector">
      <div className="app-selector-actions">
        <button type="button" className="app-select-button" onClick={handleSelect} disabled={disabled}>
          <FolderIcon />
          <span>{selectedPath ? 'Change Application' : 'Select EXE to Troubleshoot'}</span>
        </button>
        {selectedPath ? (
          <button
            type="button"
            className="clear-selection-button"
            aria-label="Clear selected application"
            onClick={() => onSelect(null)}
            disabled={disabled}
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>

      {selectedPath ? (
        <div className="selected-path" title={selectedPath}>
          {selectedPath}
        </div>
      ) : (
        <div className="selected-path muted">No app selected. System scan only.</div>
      )}
    </div>
  );
};

function FolderIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
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

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 6l8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default AppSelector;
