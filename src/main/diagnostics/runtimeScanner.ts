import { ScannerBase } from './scannerBase';
import { DiagnosticResult, Scanner, ScanContext } from './types';

export class RuntimeScanner extends ScannerBase implements Scanner {
  id = 'runtime';
  name = 'Runtime Scanner';

  async run(context?: ScanContext): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      const vcpp = await this.runPowerShell('Test-Path "C:\\Windows\\System32\\vcruntime140.dll"');
      const exists = vcpp.stdout === 'True';
      results.push(this.createResult(
        'vcpp',
        'Runtimes',
        'Visual C++ 2015-2022',
        exists ? 'passed' : 'critical',
        exists ? 'Visual C++ Runtimes are installed.' : 'Visual C++ 2015-2022 Runtimes are missing.',
        exists ? 'vcruntime140.dll found' : 'vcruntime140.dll not found',
        exists ? 'Applications can load C++ modules.' : 'Many applications will fail with 0xc000007b or missing DLL errors.',
        exists ? 'No action required.' : 'Install Microsoft Visual C++ 2015-2022 Redistributable (x64).',
        exists ? 'low' : 'critical',
        vcpp.stdout,
        { type: 'install-vcpp' }
      ));
    } catch (e) {
      results.push(this.createErrorResult('vcpp', 'Runtimes', 'Visual C++ 2015-2022', e));
    }

    try {
      const dotnet = await this.readRegistry('HKLM:\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full', 'Release');
      const is48 = dotnet && parseInt(dotnet) >= 528040;
      results.push(this.createResult(
        'dotnet-fx',
        'Runtimes',
        '.NET Framework 4.8+',
        is48 ? 'passed' : 'warning',
        is48 ? '.NET Framework 4.8 or higher is installed.' : '.NET Framework 4.8 is missing or outdated.',
        `Release Key: ${dotnet}`,
        is48 ? 'Legacy .NET apps will run correctly.' : 'Some applications requiring modern .NET features may fail.',
        is48 ? 'No action required.' : 'Install .NET Framework 4.8 Runtime.',
        is48 ? 'low' : 'medium',
        `Registry Release: ${dotnet}`,
        { type: 'install-dotnet' }
      ));
    } catch (e) {
      results.push(this.createErrorResult('dotnet-fx', 'Runtimes', '.NET Framework 4.8+', e));
    }

    try {
      const python = await this.runPowerShell(`
        $candidates = @('py', 'python', 'python3')
        $found = @()
        foreach ($candidate in $candidates) {
          $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
          if ($cmd) {
            $version = ''
            try {
              $version = (& $candidate --version 2>&1 | Out-String).Trim()
            } catch {
              $version = 'Version check failed'
            }
            $found += [pscustomobject]@{
              Command = $candidate
              Path = $cmd.Source
              Version = $version
            }
          }
        }
        $found | ConvertTo-Json -Depth 3
      `);
      const installations = parseJsonArray(python.stdout);
      const installed = installations.length > 0;

      results.push(this.createResult(
        'python-runtime',
        'Runtimes',
        'Python Installation',
        installed ? 'passed' : 'warning',
        installed ? `Python is installed (${installations[0].Version || installations[0].Command}).` : 'Python was not found on PATH.',
        installed ? installations.map((item) => `${item.Command}: ${item.Version} (${item.Path})`).join('\n') : 'Commands checked: py, python, python3',
        installed ? 'Python-based tools and scripts can run.' : 'Any Python-based support scripts or build tools will fail until Python is installed or added to PATH.',
        installed ? 'No action required.' : 'Install Python 3 from python.org or Microsoft Store, then reopen the troubleshooter.',
        installed ? 'low' : 'medium',
        python.stdout,
        installed ? undefined : { type: 'install-python' }
      ));
    } catch (e) {
      results.push(this.createErrorResult('python-runtime', 'Runtimes', 'Python Installation', e));
    }

    return results;
  }
}

function parseJsonArray(stdout: string): Array<Record<string, string>> {
  if (!stdout.trim()) return [];
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}
