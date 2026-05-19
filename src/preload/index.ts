import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectFile: () => ipcRenderer.invoke('select-file'),
  runDiagnostics: (params: { appPath?: string; isDevMode: boolean }) => 
    ipcRenderer.invoke('run-diagnostics', params),
  cancelScan: () => ipcRenderer.send('cancel-scan'),
  exportReport: (params: { report: any; format: 'txt' | 'json' | 'html' }) =>
    ipcRenderer.invoke('export-report', params),
  onScanProgress: (callback: any) => 
    ipcRenderer.on('scan-progress', (_event, value) => callback(value)),
  removeScanListeners: () => ipcRenderer.removeAllListeners('scan-progress'),
  runAutoRepair: (params: { type: string; profile?: string; action: 'enable' | 'disable' }) =>
    ipcRenderer.invoke('run-auto-repair', params),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = api
}
