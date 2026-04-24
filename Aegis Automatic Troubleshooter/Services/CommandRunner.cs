using System.Diagnostics;
using System.Security.Principal;
using System.Text;
using Aegis_Automatic_Troubleshooter.Models;

namespace Aegis_Automatic_Troubleshooter.Services;

public sealed class CommandRunner
{
    public static bool IsProcessElevated()
    {
        using WindowsIdentity identity = WindowsIdentity.GetCurrent();
        WindowsPrincipal principal = new(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    public async Task<CommandExecutionResult> RunPowerShellAsync(string script, bool requiresElevation = false, CancellationToken cancellationToken = default)
    {
        string encodedScript = Convert.ToBase64String(Encoding.Unicode.GetBytes("$ErrorActionPreference='Stop';" + Environment.NewLine + script));
        return await RunProcessAsync(
            "powershell.exe",
            $"-NoProfile -ExecutionPolicy Bypass -EncodedCommand {encodedScript}",
            requiresElevation,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<CommandExecutionResult> RunProcessAsync(string fileName, string arguments, bool requiresElevation = false, CancellationToken cancellationToken = default)
    {
        try
        {
            bool elevate = requiresElevation && !IsProcessElevated();
            ProcessStartInfo startInfo = new()
            {
                FileName = fileName,
                Arguments = arguments,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = elevate
            };

            if (elevate)
            {
                startInfo.Verb = "runas";
            }
            else
            {
                startInfo.RedirectStandardError = true;
                startInfo.RedirectStandardOutput = true;
                startInfo.StandardOutputEncoding = Encoding.UTF8;
                startInfo.StandardErrorEncoding = Encoding.UTF8;
            }

            using Process process = new() { StartInfo = startInfo, EnableRaisingEvents = true };
            if (!process.Start())
            {
                return new CommandExecutionResult
                {
                    Success = false,
                    ExitCode = -1,
                    Message = $"Unable to start {fileName}."
                };
            }

            string output = string.Empty;
            string error = string.Empty;

            if (!elevate)
            {
                Task<string> outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
                Task<string> errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
                output = await outputTask.ConfigureAwait(false);
                error = await errorTask.ConfigureAwait(false);
            }
            else
            {
                await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
            }

            return new CommandExecutionResult
            {
                Success = process.ExitCode == 0,
                ExitCode = process.ExitCode,
                StandardOutput = output.Trim(),
                StandardError = error.Trim(),
                Message = process.ExitCode == 0 ? "Completed successfully." : $"Exited with code {process.ExitCode}."
            };
        }
        catch (Exception ex)
        {
            return new CommandExecutionResult
            {
                Success = false,
                ExitCode = -1,
                Message = ex.Message,
                StandardError = ex.ToString()
            };
        }
    }
}
