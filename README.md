# Aegis Automatic Troubleshooter

A professional, modern desktop application built with Electron, React, and TypeScript to automatically diagnose and recommend fixes for common system issues.

## Features

- **Windows Security Diagnostic**: Checks Defender, Firewall, and SmartScreen status.
- **Runtime Dependency Check**: Verifies Visual C++ Redistributables and .NET Runtimes.
- **System Settings Scan**: Detects Secure Boot, VBS, Hyper-V, CPU virtualization, DMA/IOMMU, GPU-P, and core isolation layers.
- **Permission Verification**: Ensures the application is running with necessary privileges.
- **Developer Requirements**: Loads optional JSON configs so apps can define which detected settings are required.
- **Premium UI**: Glassmorphic design with smooth animations and dark mode.

## Virtualization Layers

The troubleshooter reports virtualization as separate layers instead of one generic toggle:

- `cpu-virtualization-firmware`: Intel VT-x / AMD-V enabled in firmware.
- `cpu-vm-monitor-extensions`: CPU VM monitor support.
- `cpu-slat`: SLAT / EPT / NPT support.
- `windows-hypervisor-running`: Whether the Windows hypervisor is present at runtime.
- `hyper-v-platform`: Full Hyper-V feature state.
- `virtual-machine-platform`: VM Platform feature state.
- `windows-hypervisor-platform`: Third-party hypervisor API feature state.
- `vbs-status`: Virtualization-Based Security running state.
- `virtualization-memory-integrity-hvci`: Memory Integrity / HVCI state.
- `vbs-hvci-service`: HVCI VBS service state.
- `vbs-credential-guard`: Credential Guard state.
- `iommu-dma-remapping`: IOMMU / VT-d / AMD-Vi DMA remapping availability.
- `vbs-hyper-v-dma-protection`: Kernel DMA protection state.
- `kernel-isolation-layer`: VBS or HVCI-backed kernel isolation state.
- `gpu-passthrough-partitioning`: Hyper-V GPU partitioning / GPU-P availability.

## Developer Requirement Configs

Developers can add app-specific requirements without changing the scanner code. The troubleshooter first detects the machine state, then evaluates requirement configs against detected result IDs.

Config discovery:

- `aegis-troubleshooter.config.json` in the current working directory.
- `.aegis-troubleshooter.json` in the current working directory.
- The same two file names next to the selected `.exe`.
- `<SelectedExeName>.aegis-troubleshooter.json` next to the selected `.exe`.
- Any `.json` file inside `troubleshooter-plugins` or `plugins` under those directories.
- `%APPDATA%\Aegis\Troubleshooter\aegis-troubleshooter.config.json`.

Basic format:

```json
{
  "schemaVersion": 1,
  "name": "My Program",
  "requirements": [
    {
      "checkId": "cpu-virtualization-firmware",
      "requiredStatus": "passed",
      "severity": "critical",
      "label": "CPU virtualization must be enabled",
      "recommendation": "Enable VT-x or AMD-V in BIOS/UEFI."
    }
  ]
}
```

Use `allowedStatuses` when an app intentionally requires a setting that the default troubleshooter treats as a warning. See `aegis-troubleshooter.config.example.json`.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Installation

1. Navigate to the project directory:
   ```bash
   cd aegis-troubleshooter
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Run the application in development mode:
```bash
npm run dev
```

### Building

To build a portable Windows application:
```bash
npm run build
```
The output will be in the `dist` folder.

## Note on Permissions

The troubleshooter requires **Administrator Privileges** to perform low-level system checks (like Secure Boot status and Registry queries). Please run the application as an Administrator for the best results.
