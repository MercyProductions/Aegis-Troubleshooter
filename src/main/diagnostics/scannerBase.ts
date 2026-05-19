import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ScannerBase {
  protected async runPowerShell(command: string, timeoutMs: number = 10000): Promise<{ stdout: string; stderr: string; error?: any }> {
    const fullCommand = `powershell -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '`"')}"`;
    
    try {
      const { stdout, stderr } = await execAsync(fullCommand, { timeout: timeoutMs });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
      return { stdout: '', stderr: error.message, error };
    }
  }

  protected async readRegistry(path: string, name: string): Promise<string | null> {
    const cmd = `Get-ItemProperty -Path '${path}' -Name '${name}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ${name}`;
    const result = await this.runPowerShell(cmd);
    return result.stdout || null;
  }

  protected createResult(
    id: string,
    category: string,
    label: string,
    status: any,
    details: string,
    evidence: string,
    impact: string,
    recommendation: string,
    severity: any,
    rawOutput?: string,
    autoRepair?: any
  ): any {
    return {
      id,
      category,
      label,
      status,
      details,
      evidence,
      impact,
      recommendation,
      severity,
      rawOutput,
      autoRepair,
      timestamp: new Date().toISOString()
    };
  }

  protected createErrorResult(id: string, category: string, label: string, error: any): any {
    return this.createResult(
      id,
      category,
      label,
      'warning',
      'Unable to verify component status',
      error.message || 'Internal check failure',
      'Undetermined impact due to verification failure',
      'Try running the application as Administrator or check system logs.',
      'medium',
      JSON.stringify(error)
    );
  }
}
