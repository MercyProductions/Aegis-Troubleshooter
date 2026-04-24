namespace Aegis_Automatic_Troubleshooter.Models;

public enum DiagnosticStatus
{
    Passed,
    Warning,
    Failed,
    Info
}

public enum DiagnosticSeverity
{
    Info,
    Moderate,
    High,
    Critical
}

public enum ActionKind
{
    Toggle,
    InstallPackage,
    RunCommand,
    OpenGuide,
    OpenUrl
}

public enum ArchitectureKind
{
    Unknown,
    X86,
    X64,
    Arm64
}

public enum InstallMethod
{
    Winget,
    Command,
    Url
}
