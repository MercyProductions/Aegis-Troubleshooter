import { ScannerBase } from './scannerBase';
import { DiagnosticResult, Scanner, ScanContext } from './types';

export class PermissionsScanner extends ScannerBase implements Scanner {
  id = 'permissions';
  name = 'Permissions Scanner';

  async run(context?: ScanContext): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // 1. Admin Privileges
    try {
      const isAdmin = await this.runPowerShell('([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)');
      const status = isAdmin.stdout === 'True';
      results.push(this.createResult(
        'admin',
        'Permissions',
        'Administrator Rights',
        status ? 'passed' : 'critical',
        status ? 'App is running as Administrator.' : 'App is running with standard user privileges.',
        `IsAdmin: ${isAdmin.stdout}`,
        status ? 'Full system access granted.' : 'Diagnostics and fixes requiring elevated privileges will fail.',
        status ? 'No action required.' : 'Right-click the application and select "Run as Administrator".',
        status ? 'low' : 'critical',
        isAdmin.stdout,
        { type: 'restart-admin' }
      ));
    } catch (e) {
      results.push(this.createErrorResult('admin', 'Permissions', 'Administrator Rights', e));
    }

    return results;
  }
}
