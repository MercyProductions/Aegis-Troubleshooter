import { ScannerBase } from './scannerBase';
import { DiagnosticResult, Scanner, ScanContext } from './types';

export class NetworkScanner extends ScannerBase implements Scanner {
  id = 'network';
  name = 'Network Scanner';

  async run(context?: ScanContext): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // 1. Internet Connectivity
    try {
      const ping = await this.runPowerShell('Test-Connection -ComputerName google.com -Count 1 -ErrorAction SilentlyContinue');
      const isOnline = ping.stdout !== '';
      results.push(this.createResult(
        'internet',
        'Network',
        'Internet Connectivity',
        isOnline ? 'passed' : 'critical',
        isOnline ? 'System is online.' : 'No internet connection detected.',
        ping.stdout || 'Ping failed',
        isOnline ? 'Network services available.' : 'Application may fail to activate or download updates.',
        isOnline ? 'No action required.' : 'Check your internet connection and router settings.',
        isOnline ? 'low' : 'critical'
      ));
    } catch (e) {
      results.push(this.createErrorResult('internet', 'Network', 'Internet Connectivity', e));
    }

    // 2. DNS Resolution
    try {
      const dns = await this.runPowerShell('Resolve-DnsName -Name microsoft.com -ErrorAction SilentlyContinue');
      const works = dns.stdout !== '';
      results.push(this.createResult(
        'dns',
        'Network',
        'DNS Resolution',
        works ? 'passed' : 'critical',
        works ? 'DNS is resolving correctly.' : 'DNS resolution failed.',
        dns.stdout.substring(0, 200),
        works ? 'Domain names can be resolved.' : 'Application may fail to connect to servers.',
        works ? 'No action required.' : 'Check DNS settings or try a different DNS provider (e.g., 8.8.8.8).',
        works ? 'low' : 'critical'
      ));
    } catch (e) {
      results.push(this.createErrorResult('dns', 'Network', 'DNS Resolution', e));
    }

    return results;
  }
}
