import { SecurityScanner } from './securityScanner';
import { RuntimeScanner } from './runtimeScanner';
import { WindowsInfoScanner } from './windowsInfoScanner';
import { AppScanner } from './appScanner';
import { NetworkScanner } from './networkScanner';
import { PermissionsScanner } from './permissionsScanner';
import { ProtectionScanner } from './protectionScanner';
import { VirtualizationScanner } from './virtualizationScanner';
import { evaluateRequirementConfigs } from './requirementConfig';
import { DiagnosticResult, Scanner, ScanContext, FullReport } from './types';
import os from 'os';

export class ScanEngine {
  private scanners: Scanner[] = [
    new WindowsInfoScanner(),
    new VirtualizationScanner(),
    new SecurityScanner(),
    new RuntimeScanner(),
    new PermissionsScanner(),
    new NetworkScanner(),
    new ProtectionScanner(),
    new AppScanner(),
  ];

  private results: DiagnosticResult[] = [];
  private isCancelled: boolean = false;

  async run(context: ScanContext): Promise<FullReport> {
    this.results = [];
    this.isCancelled = false;
    
    const totalScanners = this.scanners.length;
    
    for (let i = 0; i < totalScanners; i++) {
      if (this.isCancelled) break;
      
      const scanner = this.scanners[i];
      context.onProgress(((i) / totalScanners) * 100, `Running ${scanner.name}...`);
      
      const scannerResults = await scanner.run(context);
      this.results.push(...scannerResults);
    }

    context.onProgress(96, 'Running Requirements Scanner...');
    const requirementResults = evaluateRequirementConfigs(context, this.results);
    this.results.push(...requirementResults);

    context.onProgress(100, 'Scan complete');

    return this.generateReport();
  }

  cancel() {
    this.isCancelled = true;
  }

  private generateReport(): FullReport {
    const summary = {
      critical: this.results.filter(r => r.status === 'critical').length,
      warning: this.results.filter(r => r.status === 'warning').length,
      passed: this.results.filter(r => r.status === 'passed').length,
      total: this.results.length
    };

    return {
      timestamp: new Date().toISOString(),
      systemInfo: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalmem: os.totalmem()
      },
      results: this.results,
      summary
    };
  }
}
