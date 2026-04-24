using System.Text.RegularExpressions;
using System.IO;
using Microsoft.Win32;
using Aegis_Automatic_Troubleshooter.Models;

namespace Aegis_Automatic_Troubleshooter.Services;

public sealed class InstallerCatalogService
{
    private readonly CommandRunner _commandRunner;

    public InstallerCatalogService(CommandRunner commandRunner)
    {
        _commandRunner = commandRunner;
    }

    public async Task<IReadOnlyList<InstallPackage>> GetPackagesAsync(CancellationToken cancellationToken = default)
    {
        string desktopRuntimeList = string.Empty;
        CommandExecutionResult dotnetResult = await _commandRunner.RunProcessAsync("dotnet", "--list-runtimes", false, cancellationToken).ConfigureAwait(false);
        if (dotnetResult.Success)
        {
            desktopRuntimeList = dotnetResult.StandardOutput;
        }

        List<InstallPackage> packages =
        [
            EvaluateWingetPackage(
                "vcpp-2015-x64",
                "Microsoft Visual C++ 2015-2022 x64",
                "Runtime",
                "Common native dependency bundle for modern x64 desktop apps.",
                "Microsoft.VCRedist.2015+.x64",
                [ "Microsoft Visual C++ 2015-2022", "Microsoft Visual C++ 2015-2022 Redistributable (x64)", "Microsoft Visual C++ v14" ]),
            EvaluateWingetPackage(
                "vcpp-2015-x86",
                "Microsoft Visual C++ 2015-2022 x86",
                "Runtime",
                "Required by x86 apps and helper processes even on x64 Windows.",
                "Microsoft.VCRedist.2015+.x86",
                [ "Microsoft Visual C++ 2015-2022", "Microsoft Visual C++ 2015-2022 Redistributable (x86)", "Microsoft Visual C++ v14" ]),
            EvaluateWingetPackage(
                "vcpp-2013-x64",
                "Microsoft Visual C++ 2013 x64",
                "Runtime",
                "Legacy native dependency used by older clients and launchers.",
                "Microsoft.VCRedist.2013.x64",
                [ "Microsoft Visual C++ 2013 Redistributable (x64)" ]),
            EvaluateWingetPackage(
                "vcpp-2013-x86",
                "Microsoft Visual C++ 2013 x86",
                "Runtime",
                "Legacy x86 runtime dependency bundle.",
                "Microsoft.VCRedist.2013.x86",
                [ "Microsoft Visual C++ 2013 Redistributable (x86)" ]),
            EvaluateWingetPackage(
                "vcpp-2012-x64",
                "Microsoft Visual C++ 2012 x64",
                "Runtime",
                "Legacy x64 runtime often needed by older native modules.",
                "Microsoft.VCRedist.2012.x64",
                [ "Microsoft Visual C++ 2012 Redistributable (x64)" ]),
            EvaluateWingetPackage(
                "vcpp-2012-x86",
                "Microsoft Visual C++ 2012 x86",
                "Runtime",
                "Legacy x86 runtime often needed by helper binaries.",
                "Microsoft.VCRedist.2012.x86",
                [ "Microsoft Visual C++ 2012 Redistributable (x86)" ]),
            EvaluateWingetPackage(
                "vcpp-2010-x64",
                "Microsoft Visual C++ 2010 x64",
                "Runtime",
                "Older native runtime for legacy clients and plugins.",
                "Microsoft.VCRedist.2010.x64",
                [ "Microsoft Visual C++ 2010 x64 Redistributable" ]),
            EvaluateWingetPackage(
                "vcpp-2010-x86",
                "Microsoft Visual C++ 2010 x86",
                "Runtime",
                "Older x86 native runtime for legacy apps.",
                "Microsoft.VCRedist.2010.x86",
                [ "Microsoft Visual C++ 2010  x86 Redistributable", "Microsoft Visual C++ 2010 x86 Redistributable" ]),
            EvaluateDotNetFrameworkPackage(),
            EvaluateNetFx3Package(),
            EvaluateDesktopRuntimePackage("desktop-runtime-6", ".NET Windows Desktop Runtime 6 x64", "Microsoft.DotNet.DesktopRuntime.6", desktopRuntimeList, 6),
            EvaluateDesktopRuntimePackage("desktop-runtime-8", ".NET Windows Desktop Runtime 8 x64", "Microsoft.DotNet.DesktopRuntime.8.x64", desktopRuntimeList, 8),
            EvaluateWingetPackage(
                "webview2",
                "Microsoft Edge WebView2 Runtime",
                "Runtime",
                "Required by desktop apps that host web content, login views, or hybrid UI.",
                "Microsoft.EdgeWebView2Runtime",
                [ "WebView2 Runtime", "Microsoft Edge WebView2 Runtime" ]),
            EvaluateDirectXPackage()
        ];

        return packages;
    }

    private static InstallPackage EvaluateWingetPackage(string id, string name, string category, string description, string wingetId, IReadOnlyList<string> displayNamePatterns)
    {
        string evidence = FindInstalledEntry(displayNamePatterns) ?? "Not detected in installed programs.";
        return new InstallPackage
        {
            Id = id,
            DisplayName = name,
            Category = category,
            Description = description,
            InstallMethod = InstallMethod.Winget,
            WingetId = wingetId,
            InstallArguments = $"install --id {wingetId} --exact --accept-package-agreements --accept-source-agreements --silent --disable-interactivity",
            IsInstalled = evidence != "Not detected in installed programs.",
            Evidence = evidence
        };
    }

    private static InstallPackage EvaluateDotNetFrameworkPackage()
    {
        object? releaseValue = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full", "Release", null);
        int release = releaseValue is int intValue ? intValue : 0;
        bool installed = release >= 528040;

        return new InstallPackage
        {
            Id = "netfx48",
            DisplayName = ".NET Framework 4.8+ Runtime",
            Category = "Runtime",
            Description = "Managed desktop apps built for .NET Framework 4.8 or newer rely on this runtime.",
            InstallMethod = InstallMethod.Winget,
            WingetId = "Microsoft.DotNet.Framework.Runtime",
            InstallArguments = "install --id Microsoft.DotNet.Framework.Runtime --exact --accept-package-agreements --accept-source-agreements --silent --disable-interactivity",
            IsInstalled = installed,
            Evidence = installed ? $"Release value {release} detected." : "4.8+ runtime release key not detected."
        };
    }

    private static InstallPackage EvaluateNetFx3Package()
    {
        object? installValue = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\NET Framework Setup\NDP\v3.5", "Install", null);
        bool installed = installValue is int intValue && intValue == 1;

        return new InstallPackage
        {
            Id = "netfx3",
            DisplayName = ".NET Framework 3.5 Feature",
            Category = "Windows Feature",
            Description = "Some older troubleshooting tools and apps still depend on the Windows NetFx3 feature.",
            InstallMethod = InstallMethod.Command,
            CommandFileName = "dism.exe",
            CommandArguments = "/Online /Enable-Feature /FeatureName:NetFx3 /All /NoRestart",
            IsInstalled = installed,
            Evidence = installed ? ".NET Framework 3.5 feature is enabled." : ".NET Framework 3.5 feature is disabled or unavailable.",
            RequiresRestart = true
        };
    }

    private static InstallPackage EvaluateDesktopRuntimePackage(string id, string name, string wingetId, string runtimeList, int majorVersion)
    {
        Match match = Regex.Match(runtimeList, $@"Microsoft\.WindowsDesktop\.App\s+{majorVersion}\.\d+\.\d+", RegexOptions.IgnoreCase);
        return new InstallPackage
        {
            Id = id,
            DisplayName = name,
            Category = "Runtime",
            Description = $"Useful for desktop apps targeting .NET {majorVersion}.",
            InstallMethod = InstallMethod.Winget,
            WingetId = wingetId,
            InstallArguments = $"install --id {wingetId} --exact --accept-package-agreements --accept-source-agreements --silent --disable-interactivity",
            IsInstalled = match.Success,
            Evidence = match.Success ? match.Value : $"Microsoft.WindowsDesktop.App {majorVersion}.x runtime not found."
        };
    }

    private static InstallPackage EvaluateDirectXPackage()
    {
        string system32 = Environment.SystemDirectory;
        bool installed = File.Exists(Path.Combine(system32, "d3dx9_43.dll")) && File.Exists(Path.Combine(system32, "xinput1_3.dll"));

        return new InstallPackage
        {
            Id = "directx-runtime",
            DisplayName = "DirectX End-User Runtime",
            Category = "Graphics",
            Description = "Legacy DirectX runtime frequently needed by older launchers, overlays, and games.",
            InstallMethod = InstallMethod.Winget,
            WingetId = "Microsoft.DirectX",
            InstallArguments = "install --id Microsoft.DirectX --exact --accept-package-agreements --accept-source-agreements --silent --disable-interactivity",
            IsInstalled = installed,
            Evidence = installed ? "Legacy DirectX runtime DLLs are present in System32." : "Legacy DirectX runtime DLLs were not detected in System32."
        };
    }

    private static string? FindInstalledEntry(IReadOnlyList<string> displayNamePatterns)
    {
        foreach (string uninstallPath in new[]
        {
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        })
        {
            using RegistryKey? baseKey = Registry.LocalMachine.OpenSubKey(uninstallPath);
            if (baseKey is null)
            {
                continue;
            }

            foreach (string subKeyName in baseKey.GetSubKeyNames())
            {
                using RegistryKey? subKey = baseKey.OpenSubKey(subKeyName);
                string? displayName = subKey?.GetValue("DisplayName") as string;
                string? displayVersion = subKey?.GetValue("DisplayVersion") as string;

                if (string.IsNullOrWhiteSpace(displayName))
                {
                    continue;
                }

                if (displayNamePatterns.Any(pattern => displayName.Contains(pattern, StringComparison.OrdinalIgnoreCase)))
                {
                    return string.IsNullOrWhiteSpace(displayVersion) ? displayName : $"{displayName} {displayVersion}";
                }
            }
        }

        return null;
    }
}
