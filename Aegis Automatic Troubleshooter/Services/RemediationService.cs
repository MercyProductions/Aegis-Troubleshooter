using System.Diagnostics;
using System.IO;
using Aegis_Automatic_Troubleshooter.Models;

namespace Aegis_Automatic_Troubleshooter.Services;

public sealed class RemediationService
{
    public const string DefenderRealtimeActionId = "toggle:defender-realtime";
    public const string ControlledFolderAccessActionId = "toggle:controlled-folder-access";
    public const string SmartScreenActionId = "toggle:smartscreen";
    public const string FirewallActionId = "toggle:firewall";
    public const string MemoryIntegrityActionId = "toggle:memory-integrity";
    public const string TestSigningActionId = "toggle:test-signing";
    public const string HypervisorLaunchActionId = "toggle:hypervisor-launch";
    public const string UnblockFileActionId = "command:unblock-file";

    private readonly CommandRunner _commandRunner;

    public RemediationService(CommandRunner commandRunner)
    {
        _commandRunner = commandRunner;
    }

    public async Task<CommandExecutionResult> ExecuteDiagnosticActionAsync(DiagnosticAction action, string selectedAppPath, CancellationToken cancellationToken = default)
    {
        return action.ActionId switch
        {
            DefenderRealtimeActionId => await _commandRunner.RunPowerShellAsync(
                $"Set-MpPreference -DisableRealtimeMonitoring ${(action.DesiredToggleState ? "false" : "true")}",
                action.RequiresElevation,
                cancellationToken).ConfigureAwait(false),

            ControlledFolderAccessActionId => await _commandRunner.RunPowerShellAsync(
                $"Set-MpPreference -EnableControlledFolderAccess {(action.DesiredToggleState ? "Enabled" : "Disabled")}",
                action.RequiresElevation,
                cancellationToken).ConfigureAwait(false),

            SmartScreenActionId => await _commandRunner.RunPowerShellAsync(BuildSmartScreenScript(action.DesiredToggleState), action.RequiresElevation, cancellationToken).ConfigureAwait(false),

            FirewallActionId => await _commandRunner.RunPowerShellAsync(
                $"Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled {(action.DesiredToggleState ? "True" : "False")}",
                action.RequiresElevation,
                cancellationToken).ConfigureAwait(false),

            MemoryIntegrityActionId => await _commandRunner.RunPowerShellAsync(
                $"New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' -Name Enabled -Type DWord -Value {(action.DesiredToggleState ? 1 : 0)}",
                action.RequiresElevation,
                cancellationToken).ConfigureAwait(false),

            TestSigningActionId => await _commandRunner.RunProcessAsync("bcdedit.exe", $"/set testsigning {(action.DesiredToggleState ? "on" : "off")}", action.RequiresElevation, cancellationToken).ConfigureAwait(false),

            HypervisorLaunchActionId => await _commandRunner.RunProcessAsync("bcdedit.exe", $"/set hypervisorlaunchtype {(action.DesiredToggleState ? "auto" : "off")}", action.RequiresElevation, cancellationToken).ConfigureAwait(false),

            UnblockFileActionId => await _commandRunner.RunPowerShellAsync(
                $"Unblock-File -LiteralPath '{selectedAppPath.Replace("'", "''")}'",
                action.RequiresElevation,
                cancellationToken).ConfigureAwait(false),

            _ => new CommandExecutionResult
            {
                Success = false,
                ExitCode = -1,
                Message = $"Unsupported action {action.ActionId}."
            }
        };
    }

    public async Task<CommandExecutionResult> InstallPackageAsync(InstallPackage package, CancellationToken cancellationToken = default)
    {
        return package.InstallMethod switch
        {
            InstallMethod.Winget => await _commandRunner.RunProcessAsync(ResolveWingetPath(), package.InstallArguments, package.RequiresElevation, cancellationToken).ConfigureAwait(false),
            InstallMethod.Command => await _commandRunner.RunProcessAsync(package.CommandFileName, package.CommandArguments, package.RequiresElevation, cancellationToken).ConfigureAwait(false),
            InstallMethod.Url => OpenUrl(package.DownloadUrl),
            _ => new CommandExecutionResult
            {
                Success = false,
                ExitCode = -1,
                Message = "Unsupported installation method."
            }
        };
    }

    private static CommandExecutionResult OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            return new CommandExecutionResult
            {
                Success = true,
                ExitCode = 0,
                Message = "Opened the package download URL."
            };
        }
        catch (Exception ex)
        {
            return new CommandExecutionResult
            {
                Success = false,
                ExitCode = -1,
                Message = ex.Message
            };
        }
    }

    private static string ResolveWingetPath()
    {
        string localWindowsApps = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Microsoft",
            "WindowsApps",
            "winget.exe");

        return File.Exists(localWindowsApps) ? localWindowsApps : "winget";
    }

    private static string BuildSmartScreenScript(bool enabled)
    {
        string explorerValue = enabled ? "Warn" : "Off";
        int policyValue = enabled ? 1 : 0;

        return $@"
New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' -Force | Out-Null
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' -Name SmartScreenEnabled -Value '{explorerValue}'
New-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -Force | Out-Null
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -Name EnableSmartScreen -Type DWord -Value {policyValue}
";
    }
}
