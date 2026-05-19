import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ScanEngine } from './diagnostics'
import { ReportBuilder } from './diagnostics/reportBuilder'
import fs from 'fs'

let mainWindow: BrowserWindow;
const scanEngine = new ScanEngine();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#020712',
    resizable: false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // IPC handlers for window controls
  ipcMain.on('window-minimize', () => mainWindow.minimize())
  ipcMain.on('window-close', () => mainWindow.close())
  
  ipcMain.on('resize-window', (_, { width, height }) => {
    mainWindow.setResizable(true)
    mainWindow.setSize(width, height)
    mainWindow.center()
    mainWindow.setResizable(false)
  })

  // File selection
  ipcMain.handle('select-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Executables', extensions: ['exe'] }]
    })
    if (canceled) return null
    return filePaths[0]
  })

  // Diagnostics
  ipcMain.handle('run-diagnostics', async (_, { appPath, isDevMode }) => {
    const report = await scanEngine.run({
      appPath,
      isDevMode,
      onProgress: (progress, message) => {
        mainWindow.webContents.send('scan-progress', { progress, message })
      }
    });
    console.log("GENERATED REPORT:", JSON.stringify(report).substring(0, 500) + '...');
    return report;
  })

  ipcMain.on('cancel-scan', () => {
    scanEngine.cancel()
  })

  ipcMain.handle('run-auto-repair', async (_, { type, profile, action }) => {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    let command: string;
    let requiresRestart = false;
    
    if (type === 'defender-av' || type === 'defender-rtp') {
      const disableValue = action === 'enable' ? '$false' : '$true';
      command = `Set-MpPreference -DisableRealtimeMonitoring ${disableValue}`;
    } else if (type === 'defender-cloud-protection') {
      const mapsValue = action === 'enable' ? '2' : '0';
      command = `Set-MpPreference -MAPSReporting ${mapsValue}`;
    } else if (type === 'defender-sample-submission') {
      const sampleValue = action === 'enable' ? '1' : '2';
      command = `Set-MpPreference -SubmitSamplesConsent ${sampleValue}`;
    } else if (type === 'defender-pua-blocking') {
      const puaValue = action === 'enable' ? '1' : '0';
      command = `Set-MpPreference -PUAProtection ${puaValue}`;
    } else if (type === 'defender-network-protection') {
      const networkProtectionValue = action === 'enable' ? '1' : '0';
      command = `Set-MpPreference -EnableNetworkProtection ${networkProtectionValue}`;
    } else if (type === 'defender-controlled-folder-access') {
      const folderAccessValue = action === 'enable' ? 'Enabled' : 'Disabled';
      command = `Set-MpPreference -EnableControlledFolderAccess ${folderAccessValue}`;
    } else if (type === 'firewall') {
      const enabledValue = action === 'enable' ? 'True' : 'False';
      const profileTarget = profile ? profile : 'All';
      command = `Set-NetFirewallProfile -Profile ${profileTarget} -Enabled ${enabledValue}`;
    } else if (type === 'uac') {
      const uacValue = action === 'enable' ? '1' : '0';
      command = `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name 'EnableLUA' -Value ${uacValue}`;
    } else if (type === 'install-vcpp') {
      command = `winget install Microsoft.VCRedist.2015+.x64 --silent --accept-package-agreements --accept-source-agreements`;
    } else if (type === 'install-dotnet') {
      command = `winget install Microsoft.DotNet.Framework.DeveloperPack_4 --silent --accept-package-agreements --accept-source-agreements`;
    } else if (type === 'install-python') {
      command = `winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements`;
    } else if (type === 'restart-firmware') {
      command = `shutdown.exe /r /fw /t 0`;
    } else if (type === 'restart-admin') {
      const { app } = require('electron');
      const exePath = app.getPath('exe');
      // Pass args, wrap in quotes
      const args = process.argv.slice(1).map(a => `'${a}'`).join(',');
      command = `Start-Process -FilePath '${exePath}' -ArgumentList ${args || "''"} -Verb RunAs`;
      requiresRestart = true;
    } else {
      throw new Error('Unknown repair type');
    }

    const fullCommand = `powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -Command \\"${command}\\"' -Verb RunAs -Wait"`;
    
    try {
      if (type === 'restart-firmware') {
        exec(`powershell -ExecutionPolicy Bypass -Command "Start-Process -FilePath shutdown.exe -ArgumentList '/r /fw /t 0' -Verb RunAs"`);
        return { success: true };
      }

      if (requiresRestart) {
        // Run without wait so it doesn't block the exit
        exec(`powershell -ExecutionPolicy Bypass -Command "${command}"`);
        setTimeout(() => {
          const { app } = require('electron');
          app.quit();
        }, 1000);
        return { success: true };
      } else {
        await execAsync(fullCommand);
        return { success: true };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  })

  ipcMain.handle('export-report', async (_, { report, format }) => {
    const extensions = { txt: 'txt', json: 'json', html: 'html' };
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `Aegis_Report_${Date.now()}.${extensions[format]}`,
      filters: [{ name: format.toUpperCase(), extensions: [extensions[format]] }]
    });

    if (canceled || !filePath) return false;

    let content = '';
    if (format === 'txt') content = ReportBuilder.toTXT(report);
    else if (format === 'json') content = ReportBuilder.toJSON(report);
    else if (format === 'html') content = ReportBuilder.toHTML(report);

    fs.writeFileSync(filePath, content);
    return true;
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
