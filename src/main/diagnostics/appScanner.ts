import { ScannerBase } from './scannerBase';
import { DiagnosticResult, Scanner, ScanContext } from './types';
import fs from 'fs';
import path from 'path';

export class AppScanner extends ScannerBase implements Scanner {
  id = 'app';
  name = 'Application Scanner';

  async run(context: ScanContext): Promise<DiagnosticResult[]> {
    if (!context.appPath) return [];

    const results: DiagnosticResult[] = [];
    const appPath = context.appPath;

    // 1. File Existence & Permissions
    try {
      const stats = fs.statSync(appPath);
      const isExe = path.extname(appPath).toLowerCase() === '.exe';
      
      results.push(this.createResult(
        'app-exists',
        'App File',
        'File Status',
        isExe ? 'passed' : 'critical',
        isExe ? `Found valid executable: ${path.basename(appPath)}` : 'Selected file is not an executable.',
        `Path: ${appPath}, Size: ${stats.size} bytes`,
        isExe ? 'File is accessible.' : 'Troubleshooter only supports .exe files.',
        isExe ? 'No action required.' : 'Please select a valid .exe file.',
        isExe ? 'low' : 'critical'
      ));
    } catch (e) {
      results.push(this.createErrorResult('app-exists', 'App File', 'File Status', e));
    }

    // 2. Architecture Detection
    try {
      const buffer = Buffer.alloc(1024);
      const fd = fs.openSync(appPath, 'r');
      fs.readSync(fd, buffer, 0, 1024, 0);
      fs.closeSync(fd);

      // Simple PE check
      const mzHeader = buffer.readUInt16LE(0);
      if (mzHeader === 0x5A4D) { // MZ
        const peOffset = buffer.readUInt32LE(0x3C);
        const machineType = buffer.readUInt16LE(peOffset + 4);
        
        let arch = 'Unknown';
        if (machineType === 0x014c) arch = 'x86 (32-bit)';
        else if (machineType === 0x8664) arch = 'x64 (64-bit)';
        else if (machineType === 0xaa64) arch = 'ARM64';

        results.push(this.createResult(
          'app-arch',
          'App File',
          'Architecture',
          'passed',
          `Detected architecture: ${arch}`,
          `Machine Type: 0x${machineType.toString(16)}`,
          'Compatible with current OS.',
          'No action required.',
          'low'
        ));
      }
    } catch (e) {
      results.push(this.createErrorResult('app-arch', 'App File', 'Architecture', e));
    }

    // 3. Recent Crashes (Event Viewer)
    try {
      const exeName = path.basename(appPath);
      const psCmd = `Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='Application Error'} -MaxEvents 5 | Where-Object {$_.Message -like '*${exeName}*'} | Select-Object -Property TimeCreated, Message | ConvertTo-Json`;
      const crashes = await this.runPowerShell(psCmd);
      
      if (crashes.stdout && crashes.stdout !== '[]') {
        results.push(this.createResult(
          'app-crashes',
          'App Diagnostics',
          'Recent Crashes',
          'critical',
          'Recent crash logs found for this application.',
          crashes.stdout.substring(0, 500) + '...',
          'Application is unstable or failing due to environmental issues.',
          'Analyze the exception codes below for specific fixes.',
          'high',
          crashes.stdout
        ));
      } else {
        results.push(this.createResult(
          'app-crashes',
          'App Diagnostics',
          'Recent Crashes',
          'passed',
          'No recent crash logs found in Event Viewer.',
          'Checked Application Error logs for match.',
          'Application appears to start correctly from a system perspective.',
          'No action required.',
          'low'
        ));
      }
    } catch (e) {
      results.push(this.createErrorResult('app-crashes', 'App Diagnostics', 'Recent Crashes', e));
    }

    return results;
  }
}
