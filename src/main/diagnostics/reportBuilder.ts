export class ReportBuilder {
  static toTXT(report: any): string {
    let txt = `AEGIS SYSTEM TROUBLESHOOTER REPORT\n`;
    txt += `==================================\n\n`;
    txt += `Scan Date: ${new Date(report.timestamp).toLocaleString()}\n`;
    txt += `System: ${report.systemInfo.platform} ${report.systemInfo.release} (${report.systemInfo.arch})\n`;
    if (report.appInfo) txt += `App: ${report.appInfo.name} (${report.appInfo.path})\n`;
    txt += `\nSUMMARY:\n`;
    txt += `- Critical: ${report.summary.critical}\n`;
    txt += `- Warnings: ${report.summary.warning}\n`;
    txt += `- Passed: ${report.summary.passed}\n`;
    txt += `\nDETAILED RESULTS:\n`;
    txt += `-----------------\n`;

    report.results.forEach((r: any) => {
      txt += `[${r.status.toUpperCase()}] ${r.label}\n`;
      txt += `Details: ${r.details}\n`;
      txt += `Evidence: ${r.evidence}\n`;
      txt += `Recommendation: ${r.recommendation}\n`;
      txt += `-----------------\n`;
    });

    return txt;
  }

  static toJSON(report: any): string {
    return JSON.stringify(report, null, 2);
  }

  static toHTML(report: any): string {
    // Simple HTML template
    let html = `<html><head><style>
      body { font-family: sans-serif; background: #07090e; color: #fff; padding: 40px; }
      .card { background: #0b111c; border: 1px solid #334155; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
      .critical { border-left: 5px solid #ff4d4d; }
      .warning { border-left: 5px solid #f6c343; }
      .passed { border-left: 5px solid #00d6a3; }
      h1 { color: #1683ff; }
    </style></head><body>`;
    
    html += `<h1>Aegis Diagnostic Report</h1>`;
    html += `<p>Generated on ${new Date(report.timestamp).toLocaleString()}</p>`;
    
    report.results.forEach((r: any) => {
      html += `<div class="card ${r.status}">`;
      html += `<h3>${r.label} - ${r.status.toUpperCase()}</h3>`;
      html += `<p><b>Details:</b> ${r.details}</p>`;
      html += `<p><b>Recommendation:</b> ${r.recommendation}</p>`;
      html += `</div>`;
    });

    html += `</body></html>`;
    return html;
  }
}
