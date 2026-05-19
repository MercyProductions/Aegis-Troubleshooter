import { ScannerBase } from './scannerBase';
import { DiagnosticResult, Scanner, ScanContext } from './types';

type PowerShellRow = Record<string, any>;

const antiCheatPatterns = [
  'EasyAntiCheat',
  'Easy Anti-Cheat',
  'BEService',
  'BEDaisy',
  'BattlEye',
  'vgc',
  'vgk',
  'Vanguard',
  'FACEIT',
  'EAAntiCheat',
  'EA AntiCheat',
  'PnkBstr',
  'PunkBuster',
  'XIGNCODE',
  'Ricochet'
];

export class ProtectionScanner extends ScannerBase implements Scanner {
  id = 'protection';
  name = 'Protection Services Scanner';

  async run(context?: ScanContext): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    const antiCheat = await this.scanAntiCheatRuntime();
    results.push(antiCheat);

    try {
      const av = await this.runPowerShell('Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct | Select-Object -Property displayName | ConvertTo-Json');
      const products = parseRows(av.stdout)
        .map((row) => String(row.displayName ?? row.DisplayName ?? '').trim())
        .filter(Boolean);
      const thirdParty = products.filter((name) => !name.toLowerCase().includes('windows defender') && !name.toLowerCase().includes('microsoft defender'));

      if (thirdParty.length > 0) {
        results.push(this.createResult(
          'protection-3rd-party-av',
          'Protection Services',
          'Third-Party Antivirus',
          'warning',
          'A third-party antivirus product was detected.',
          thirdParty.join(', '),
          'Third-party AV can sometimes block application components or low-level tooling.',
          'Add Aegis to the antivirus allow list if the launcher or mod loader is blocked.',
          'medium',
          av.stdout
        ));
      } else {
        results.push(this.createResult(
          'protection-3rd-party-av',
          'Protection Services',
          'Third-Party Antivirus',
          'passed',
          'No third-party antivirus product was reported by Windows Security Center.',
          products.length > 0 ? products.join(', ') : 'No antivirus products returned by SecurityCenter2.',
          'No additional antivirus conflict was detected.',
          'No action required.',
          'low',
          av.stdout
        ));
      }
    } catch (error) {
      results.push(this.createErrorResult('protection-3rd-party-av', 'Protection Services', 'Third-Party Antivirus', error));
    }

    return results;
  }

  private async scanAntiCheatRuntime(): Promise<DiagnosticResult> {
    const patternArray = `@(${antiCheatPatterns.map((pattern) => `'${pattern.replace(/'/g, "''")}'`).join(',')})`;
    const serviceCommand = `
      $patterns = ${patternArray};
      Get-CimInstance Win32_Service |
        Where-Object {
          $service = $_;
          @($patterns | Where-Object {
            ($service.Name -like "*$_*") -or
            ($service.DisplayName -like "*$_*")
          }).Count -gt 0
        } |
        Select-Object Name, DisplayName, State, ProcessId |
        ConvertTo-Json -Depth 3
    `;
    const processCommand = `
      $patterns = ${patternArray};
      Get-Process -ErrorAction SilentlyContinue |
        Where-Object {
          $process = $_;
          @($patterns | Where-Object { $process.Name -like "*$_*" }).Count -gt 0
        } |
        Select-Object Name, Id, Path |
        ConvertTo-Json -Depth 3
    `;

    const [serviceResult, processResult] = await Promise.all([
      this.runPowerShell(serviceCommand, 15000),
      this.runPowerShell(processCommand, 15000)
    ]);

    const services = parseRows(serviceResult.stdout);
    const processes = parseRows(processResult.stdout);
    const runningServices = services.filter((service) => String(service.State ?? '').toLowerCase() === 'running');
    const activeProcesses = processes.filter((process) => Boolean(process.Name));
    const detections = [
      ...runningServices.map((service) => ({
        type: 'service',
        name: String(service.DisplayName || service.Name || 'Unknown service'),
        detail: `Service ${service.Name ?? 'unknown'} is ${service.State ?? 'unknown'}`
      })),
      ...activeProcesses.map((process) => ({
        type: 'process',
        name: String(process.Name || 'Unknown process'),
        detail: `Process ${process.Name ?? 'unknown'} is running with PID ${process.Id ?? 'unknown'}`
      }))
    ];

    const uniqueDetections = dedupeDetections(detections);
    const installedStopped = services
      .filter((service) => String(service.State ?? '').toLowerCase() !== 'running')
      .map((service) => `${service.DisplayName || service.Name} (${service.State ?? 'unknown'})`);

    if (uniqueDetections.length > 0) {
      const evidence = uniqueDetections.map((detection) => detection.detail).join('\n');
      return this.createResult(
        'protection-anti-cheat-runtime',
        'Protection Services',
        'Anti-Cheat Runtime',
        'critical',
        `${uniqueDetections.length} anti-cheat component${uniqueDetections.length === 1 ? '' : 's'} currently running.`,
        evidence,
        'Aegis troubleshooting and mod tools should not run while anti-cheat services or protected-game processes are active.',
        'Close protected games and their launchers. If a service remains active, restart Windows before running Aegis again.',
        'high',
        JSON.stringify({ services, processes }, null, 2)
      );
    }

    return this.createResult(
      'protection-anti-cheat-runtime',
      'Protection Services',
      'Anti-Cheat Runtime',
      'passed',
      'No active anti-cheat service or process detected.',
      installedStopped.length > 0 ? `Installed but stopped: ${installedStopped.join(', ')}` : 'No matching active services or processes were found.',
      'No anti-cheat runtime conflict was detected.',
      'No action required.',
      'low',
      JSON.stringify({ services, processes }, null, 2)
    );
  }
}

function parseRows(stdout: string): PowerShellRow[] {
  if (!stdout.trim()) return [];
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function dedupeDetections(detections: Array<{ type: string; name: string; detail: string }>) {
  const seen = new Set<string>();
  return detections.filter((detection) => {
    const key = `${detection.type}:${detection.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
