namespace Aegis_Automatic_Troubleshooter.Models;

public sealed class CommandExecutionResult
{
    public bool Success { get; init; }
    public int ExitCode { get; init; }
    public string StandardOutput { get; init; } = string.Empty;
    public string StandardError { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
}
