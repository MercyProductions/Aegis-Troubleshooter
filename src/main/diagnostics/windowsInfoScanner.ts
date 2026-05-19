import { ScannerBase } from './scannerBase';
import { DiagnosticResult, Scanner, ScanContext } from './types';
import os from 'os';

export class WindowsInfoScanner extends ScannerBase implements Scanner {
  id = 'wininfo';
  name = 'Windows Info Scanner';

  async run(context?: ScanContext): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // 1. Windows Version & Build
    try {
      const build = os.release();
      const version = await this.runPowerShell('(Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion").ProductName');
      results.push(this.createResult(
        'win-version',
        'System',
        'Windows OS',
        'passed',
        `${version.stdout} (Build ${build})`,
        `Release: ${build}`,
        'System compatibility check.',
        'No action required.',
        'low',
        `OS: ${version.stdout}, Release: ${build}, Arch: ${os.arch()}`
      ));
    } catch (e) {
      results.push(this.createErrorResult('win-version', 'System', 'Windows OS', e));
    }

    // 2. Secure Boot
    try {
      let isEnabled = false;
      let rawOutput = '';
      
      const sb = await this.runPowerShell('Confirm-SecureBootUEFI');
      if (sb.stdout === 'True' || sb.stdout === 'False') {
        isEnabled = sb.stdout === 'True';
        rawOutput = `Confirm-SecureBootUEFI: ${sb.stdout}`;
      } else {
        // Fallback to registry if Confirm-SecureBootUEFI throws Access Denied
        const regCheck = await this.runPowerShell("Get-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\SecureBoot\\State' -Name UEFISecureBootEnabled -ErrorAction SilentlyContinue | Select-Object -ExpandProperty UEFISecureBootEnabled");
        isEnabled = regCheck.stdout.trim() === '1';
        rawOutput = `Confirm-SecureBootUEFI Failed. Registry UEFISecureBootEnabled: ${regCheck.stdout}`;
      }

      results.push(this.createResult(
        'secure-boot',
        'System',
        'Secure Boot',
        isEnabled ? 'passed' : 'warning',
        isEnabled ? 'Secure Boot is enabled.' : 'Secure Boot is disabled.',
        rawOutput,
        isEnabled ? 'Kernel integrity is verified by hardware.' : 'Some features or anti-cheats may require Secure Boot.',
        isEnabled ? 'No action required.' : 'Enable Secure Boot in BIOS if required by your application.',
        isEnabled ? 'low' : 'medium',
        rawOutput,
        isEnabled ? undefined : { type: 'restart-firmware' }
      ));
    } catch (e) {
      results.push(this.createResult(
        'secure-boot',
        'System',
        'Secure Boot',
        'warning',
        'Unable to verify Secure Boot status.',
        e.message || 'Access Denied or Non-UEFI system',
        'Status unknown.',
        'Ensure the app is running as Administrator.',
        'medium',
        e.message || 'Access Denied or Non-UEFI system',
        { type: 'restart-firmware' }
      ));
    }

    return results;
  }
}
