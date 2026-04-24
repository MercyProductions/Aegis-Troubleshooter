namespace Aegis_Automatic_Troubleshooter.Models;

public sealed class CrashEventInfo
{
    public DateTime Timestamp { get; init; }
    public string Source { get; init; } = string.Empty;
    public string ApplicationName { get; init; } = string.Empty;
    public string ModuleName { get; init; } = string.Empty;
    public string ExceptionCode { get; init; } = string.Empty;
    public string FaultOffset { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
}
