namespace Aegis_Automatic_Troubleshooter.Models;

public sealed class TroubleshootingSnapshot
{
    public IReadOnlyList<DiagnosticItem> Diagnostics { get; init; } = Array.Empty<DiagnosticItem>();
    public IReadOnlyList<InstallPackage> InstallPackages { get; init; } = Array.Empty<InstallPackage>();
    public IReadOnlyList<CrashEventInfo> CrashEvents { get; init; } = Array.Empty<CrashEventInfo>();
    public IReadOnlyList<string> ActivityNotes { get; init; } = Array.Empty<string>();
    public string TargetApplicationPath { get; init; } = string.Empty;
    public string ServerUrl { get; init; } = string.Empty;
}
