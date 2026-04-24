using System.Diagnostics;
using System.Diagnostics.Eventing.Reader;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using Aegis_Automatic_Troubleshooter.Models;

namespace Aegis_Automatic_Troubleshooter.Services;

public sealed class TroubleshootingEngine
{
    private static readonly string[] CommonRuntimeDlls =
    [
        "VCRUNTIME140.dll",
        "VCRUNTIME140_1.dll",
        "MSVCP140.dll",
        "d3dcompiler_47.dll",
        "dxcompiler.dll",
        "WebView2Loader.dll"
    ];

    private static readonly string[] OverlayProcesses =
    [
        "Discord",
        "Steam",
        "RTSS",
        "MSIAfterburner",
        "Overwolf",
        "obs64",
        "NVIDIA Share",
        "RadeonSoftware",
        "XboxGameBar"
    ];

    private readonly CommandRunner _commandRunner;
    private readonly InstallerCatalogService _installerCatalogService;

    public TroubleshootingEngine(CommandRunner commandRunner, InstallerCatalogService installerCatalogService)
    {
        _commandRunner = commandRunner;
        _installerCatalogService = installerCatalogService;
    }

    public async Task<TroubleshootingSnapshot> RunAsync(string? targetApplicationPath, string? serverUrl, CancellationToken cancellationToken = default)
    {
        List<string> notes = [];
        List<DiagnosticItem> diagnostics = [];
        List<CrashEventInfo> crashEvents = [];
        IReadOnlyList<InstallPackage> packages = await _installerCatalogService.GetPackagesAsync(cancellationToken).ConfigureAwait(false);
        string normalizedServerUrl = serverUrl?.Trim() ?? string.Empty;
        string normalizedTarget = targetApplicationPath?.Trim('"', ' ') ?? string.Empty;

        notes.Add($"Diagnostic run started at {DateTime.Now:G}.");

        TargetApplicationContext target = InspectTargetApplication(normalizedTarget, notes);

        diagnostics.Add(await CreateDefenderRealtimeDiagnosticAsync(cancellationToken).ConfigureAwait(false));
        diagnostics.Add(await CreateControlledFolderAccessDiagnosticAsync(cancellationToken).ConfigureAwait(false));
        diagnostics.Add(CreateSmartScreenDiagnostic());
        diagnostics.Add(await CreateFirewallDiagnosticAsync(normalizedServerUrl, cancellationToken).ConfigureAwait(false));
        diagnostics.Add(CreateMemoryIntegrityDiagnostic());
        diagnostics.Add(await CreateTestSigningDiagnosticAsync(cancellationToken).ConfigureAwait(false));
        diagnostics.Add(await CreateHypervisorDiagnosticAsync(cancellationToken).ConfigureAwait(false));
        diagnostics.Add(await CreateSecureBootDiagnosticAsync(cancellationToken).ConfigureAwait(false));
        diagnostics.Add(CreateWindowsVersionDiagnostic());
        diagnostics.Add(await CreateGpuDriverDiagnosticAsync(cancellationToken).ConfigureAwait(false));
        diagnostics.AddRange(CreateRuntimeDiagnostics(packages, target));
        diagnostics.AddRange(await CreateNetworkDiagnosticsAsync(normalizedServerUrl, cancellationToken).ConfigureAwait(false));
        diagnostics.AddRange(CreatePermissionDiagnostics(target));
        diagnostics.AddRange(CreateProcessDiagnostics(target));
        diagnostics.Add(await CreateProtectionHistoryDiagnosticAsync(target, cancellationToken).ConfigureAwait(false));

        if (target.Exists)
        {
            crashEvents = ReadCrashEvents(target.ProcessName, target.FileName, notes);
            diagnostics.Add(CreateCrashEventSummary(crashEvents));
        }
        else
        {
            diagnostics.Add(new DiagnosticItem
            {
                Id = "target-selection",
                Category = "Target App",
                Title = "Target application selected",
                Summary = "Pick the executable you actually want to troubleshoot to unlock dependency, crash, and permission checks.",
                Evidence = "No target executable selected yet.",
                Recommendation = "Use Browse App and select the app's .exe file.",
                Status = DiagnosticStatus.Warning,
                Severity = DiagnosticSeverity.Moderate
            });
        }

        diagnostics = diagnostics
            .OrderByDescending(item => item.Status == DiagnosticStatus.Failed)
            .ThenByDescending(item => item.Status == DiagnosticStatus.Warning)
            .ThenBy(item => item.Category)
            .ThenBy(item => item.Title)
            .ToList();

        notes.Add($"Completed with {diagnostics.Count(item => item.Status == DiagnosticStatus.Failed)} failed checks, {diagnostics.Count(item => item.Status == DiagnosticStatus.Warning)} warnings, and {packages.Count(item => !item.IsInstalled)} missing packages.");

        return new TroubleshootingSnapshot
        {
            Diagnostics = diagnostics,
            InstallPackages = packages,
            CrashEvents = crashEvents,
            ActivityNotes = notes,
            TargetApplicationPath = normalizedTarget,
            ServerUrl = normalizedServerUrl
        };
    }

    private static TargetApplicationContext InspectTargetApplication(string path, List<string> notes)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return TargetApplicationContext.Empty;
        }

        TargetApplicationContext context = new()
        {
            FullPath = path,
            Exists = true,
            FileName = Path.GetFileName(path),
            DirectoryPath = Path.GetDirectoryName(path) ?? string.Empty
        };

        context.ProcessName = Path.GetFileNameWithoutExtension(context.FileName);
        context.Architecture = ReadPortableExecutableArchitecture(path);
        context.IsManaged = IsManagedAssembly(path);
        context.IsBlockedFromInternet = HasZoneIdentifier(path);
        context.IsUnderProgramFiles = context.FullPath.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), StringComparison.OrdinalIgnoreCase)
            || context.FullPath.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), StringComparison.OrdinalIgnoreCase);

        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        string[] userFolders =
        [
            Path.Combine(userProfile, "Desktop"),
            Path.Combine(userProfile, "Downloads"),
            Path.Combine(userProfile, "Documents")
        ];
        context.IsUnderUserContentFolder = userFolders.Any(folder => context.FullPath.StartsWith(folder, StringComparison.OrdinalIgnoreCase));
        context.DirectoryWritable = ProbeDirectoryWrite(context.DirectoryPath);
        context.RunningProcesses = Process.GetProcessesByName(context.ProcessName).Length;
        context.LockingProcesses = RestartManagerService.GetLockingProcesses(context.FullPath);
        context.MissingRuntimeDlls = FindMissingRuntimeDlls(context.DirectoryPath);

        notes.Add($"Target application loaded: {context.FullPath}");
        notes.Add($"Architecture: {context.Architecture}; Managed: {context.IsManaged}; Running instances: {context.RunningProcesses}");
        return context;
    }

    private async Task<DiagnosticItem> CreateDefenderRealtimeDiagnosticAsync(CancellationToken cancellationToken)
    {
        CommandExecutionResult result = await _commandRunner.RunPowerShellAsync(
            "$pref = Get-MpPreference; [pscustomobject]@{ DisableRealtimeMonitoring = [bool]$pref.DisableRealtimeMonitoring } | ConvertTo-Json -Compress",
            false,
            cancellationToken).ConfigureAwait(false);

        bool isDisabled = TryReadBooleanJson(result.StandardOutput, "DisableRealtimeMonitoring");
        DiagnosticItem item = new()
        {
            Id = "security-defender-realtime",
            Category = "Windows Security",
            Title = "Microsoft Defender real-time protection",
            Summary = "Real-time protection can block unknown launchers, injectors, unpackers, and self-updating apps.",
            Evidence = result.Success
                ? (isDisabled ? "Real-time protection is currently disabled." : "Real-time protection is currently enabled.")
                : "Unable to read Defender preference state.",
            Recommendation = "If Defender is blocking the app, toggle this setting temporarily and test again.",
            Status = result.Success ? DiagnosticStatus.Warning : DiagnosticStatus.Info,
            Severity = DiagnosticSeverity.Moderate
        };

        item.Actions.Add(new DiagnosticAction
        {
            ActionId = RemediationService.DefenderRealtimeActionId,
            Kind = ActionKind.Toggle,
            Title = isDisabled ? "Turn On" : "Turn Off",
            Hint = "Toggles Microsoft Defender real-time monitoring.",
            DesiredToggleState = !isDisabled,
            RequiresElevation = true
        });

        return item;
    }

    private async Task<DiagnosticItem> CreateControlledFolderAccessDiagnosticAsync(CancellationToken cancellationToken)
    {
        CommandExecutionResult result = await _commandRunner.RunPowerShellAsync(
            "$pref = Get-MpPreference; [pscustomobject]@{ ControlledFolderAccess = [int]$pref.EnableControlledFolderAccess } | ConvertTo-Json -Compress",
            false,
            cancellationToken).ConfigureAwait(false);

        int mode = TryReadIntJson(result.StandardOutput, "ControlledFolderAccess");
        bool enabled = mode == 1 || mode == 2;
        DiagnosticItem item = new()
        {
            Id = "security-controlled-folder-access",
            Category = "Windows Security",
            Title = "Controlled Folder Access",
            Summary = "Controlled Folder Access can stop apps from writing configs, logs, caches, or updater payloads.",
            Evidence = result.Success
                ? (enabled ? $"Controlled Folder Access mode {mode} is enabled." : "Controlled Folder Access is disabled.")
                : "Unable to read Controlled Folder Access state.",
            Recommendation = "Disable or audit this temporarily if the app cannot create files or save settings.",
            Status = enabled ? DiagnosticStatus.Warning : DiagnosticStatus.Passed,
            Severity = DiagnosticSeverity.Moderate
        };

        item.Actions.Add(new DiagnosticAction
        {
            ActionId = RemediationService.ControlledFolderAccessActionId,
            Kind = ActionKind.Toggle,
            Title = enabled ? "Turn Off" : "Turn On",
            Hint = "Toggles Controlled Folder Access.",
            DesiredToggleState = !enabled,
            RequiresElevation = true
        });

        return item;
    }

    private static DiagnosticItem CreateSmartScreenDiagnostic()
    {
        string explorerValue = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer", "SmartScreenEnabled", "Unknown") as string ?? "Unknown";
        object? policy = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows\System", "EnableSmartScreen", null);
        bool enabled = !explorerValue.Equals("Off", StringComparison.OrdinalIgnoreCase) && (policy is not int intPolicy || intPolicy != 0);

        DiagnosticItem item = new()
        {
            Id = "security-smartscreen",
            Category = "Windows Security",
            Title = "SmartScreen reputation checks",
            Summary = "SmartScreen can block downloaded apps that do not yet have enough reputation.",
            Evidence = $"Explorer SmartScreen value: {explorerValue}. Policy value: {(policy ?? "not set")}.",
            Recommendation = "If Windows marks the app as untrusted or blocks launch, toggle SmartScreen and re-test.",
            Status = enabled ? DiagnosticStatus.Warning : DiagnosticStatus.Passed,
            Severity = DiagnosticSeverity.Moderate
        };

        item.Actions.Add(new DiagnosticAction
        {
            ActionId = RemediationService.SmartScreenActionId,
            Kind = ActionKind.Toggle,
            Title = enabled ? "Turn Off" : "Turn On",
            Hint = "Toggles SmartScreen and App & Browser Control reputation checks.",
            DesiredToggleState = !enabled,
            RequiresElevation = true
        });

        return item;
    }

    private async Task<DiagnosticItem> CreateFirewallDiagnosticAsync(string serverUrl, CancellationToken cancellationToken)
    {
        CommandExecutionResult result = await _commandRunner.RunPowerShellAsync(
            "Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress",
            false,
            cancellationToken).ConfigureAwait(false);

        bool allEnabled = result.StandardOutput.Contains("\"Enabled\":true", StringComparison.OrdinalIgnoreCase);
        DiagnosticStatus status = string.IsNullOrWhiteSpace(serverUrl) ? DiagnosticStatus.Info : DiagnosticStatus.Warning;
        string evidence = result.Success ? result.StandardOutput : "Unable to query firewall profiles.";

        DiagnosticItem item = new()
        {
            Id = "security-firewall",
            Category = "Windows Security",
            Title = "Windows Firewall profile state",
            Summary = "Firewall rules can block login, updates, or remote services used by the app.",
            Evidence = evidence,
            Recommendation = string.IsNullOrWhiteSpace(serverUrl)
                ? "If the app needs network access, test with a server URL configured and review firewall state."
                : "If the app cannot reach the configured server, temporarily turn the firewall off to isolate the problem.",
            Status = allEnabled ? status : DiagnosticStatus.Passed,
            Severity = DiagnosticSeverity.Moderate
        };

        item.Actions.Add(new DiagnosticAction
        {
            ActionId = RemediationService.FirewallActionId,
            Kind = ActionKind.Toggle,
            Title = allEnabled ? "Turn Off" : "Turn On",
            Hint = "Toggles Windows Firewall for Domain, Private, and Public profiles.",
            DesiredToggleState = !allEnabled,
            RequiresElevation = true
        });

        return item;
    }

    private static DiagnosticItem CreateMemoryIntegrityDiagnostic()
    {
        object? enabledValue = Registry.GetValue(
            @"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity",
            "Enabled",
            0);

        bool enabled = enabledValue is int intValue && intValue != 0;
        DiagnosticItem item = new()
        {
            Id = "driver-memory-integrity",
            Category = "Driver Restrictions",
            Title = "Core isolation / Memory Integrity",
            Summary = "Memory Integrity can block unsigned or incompatible kernel and low-level components.",
            Evidence = enabled ? "Memory Integrity is enabled." : "Memory Integrity is disabled.",
            Recommendation = "If the app depends on drivers or low-level helpers, toggle this and restart before retesting.",
            Status = enabled ? DiagnosticStatus.Warning : DiagnosticStatus.Passed,
            Severity = DiagnosticSeverity.High
        };

        item.Actions.Add(new DiagnosticAction
        {
            ActionId = RemediationService.MemoryIntegrityActionId,
            Kind = ActionKind.Toggle,
            Title = enabled ? "Turn Off" : "Turn On",
            Hint = "Changes the HVCI registry setting. Restart required.",
            DesiredToggleState = !enabled,
            RequiresElevation = true,
            RequiresRestart = true
        });

        return item;
    }

    private async Task<DiagnosticItem> CreateTestSigningDiagnosticAsync(CancellationToken cancellationToken)
    {
        CommandExecutionResult result = await _commandRunner.RunProcessAsync("bcdedit.exe", "/enum {current}", false, cancellationToken).ConfigureAwait(false);
        bool enabled = result.StandardOutput.Contains("testsigning", StringComparison.OrdinalIgnoreCase)
            && result.StandardOutput.Contains("Yes", StringComparison.OrdinalIgnoreCase);

        DiagnosticItem item = new()
        {
            Id = "driver-test-signing",
            Category = "Driver Restrictions",
            Title = "Test Signing mode",
            Summary = "Some low-level tools only work when Test Signing is enabled, while others fail when it remains on.",
            Evidence = result.Success ? ExtractBcdLine(result.StandardOutput, "testsigning") : "Unable to query BCD state.",
            Recommendation = "Toggle Test Signing and reboot if the app or its driver has strict signature requirements.",
            Status = DiagnosticStatus.Info,
            Severity = DiagnosticSeverity.Moderate
        };

        item.Actions.Add(new DiagnosticAction
        {
            ActionId = RemediationService.TestSigningActionId,
            Kind = ActionKind.Toggle,
            Title = enabled ? "Turn Off" : "Turn On",
            Hint = "Changes the testsigning BCD flag. Restart required.",
            DesiredToggleState = !enabled,
            RequiresElevation = true,
            RequiresRestart = true
        });

        return item;
    }

    private async Task<DiagnosticItem> CreateHypervisorDiagnosticAsync(CancellationToken cancellationToken)
    {
        CommandExecutionResult result = await _commandRunner.RunProcessAsync("bcdedit.exe", "/enum {current}", false, cancellationToken).ConfigureAwait(false);
        bool auto = result.StandardOutput.Contains("hypervisorlaunchtype", StringComparison.OrdinalIgnoreCase)
            && result.StandardOutput.Contains("Auto", StringComparison.OrdinalIgnoreCase);

        DiagnosticItem item = new()
        {
            Id = "driver-hypervisor",
            Category = "Driver Restrictions",
            Title = "Hyper-V / hypervisor launch",
            Summary = "VBS and Hyper-V can interfere with tools that expect direct low-level access.",
            Evidence = result.Success ? ExtractBcdLine(result.StandardOutput, "hypervisorlaunchtype") : "Unable to query hypervisor launch type.",
            Recommendation = "If low-level app features fail, try toggling the hypervisor launch type and restart.",
            Status = auto ? DiagnosticStatus.Warning : DiagnosticStatus.Info,
            Severity = DiagnosticSeverity.High
        };

        item.Actions.Add(new DiagnosticAction
        {
            ActionId = RemediationService.HypervisorLaunchActionId,
            Kind = ActionKind.Toggle,
            Title = auto ? "Turn Off" : "Turn On",
            Hint = "Changes the hypervisor launch type. Restart required.",
            DesiredToggleState = !auto,
            RequiresElevation = true,
            RequiresRestart = true
        });

        return item;
    }

    private async Task<DiagnosticItem> CreateSecureBootDiagnosticAsync(CancellationToken cancellationToken)
    {
        CommandExecutionResult result = await _commandRunner.RunPowerShellAsync(
            "try { [pscustomobject]@{ Enabled = [bool](Confirm-SecureBootUEFI) } | ConvertTo-Json -Compress } catch { [pscustomobject]@{ Enabled = $false; Error = $_.Exception.Message } | ConvertTo-Json -Compress }",
            false,
            cancellationToken).ConfigureAwait(false);

        bool enabled = TryReadBooleanJson(result.StandardOutput, "Enabled");
        string error = TryReadStringJson(result.StandardOutput, "Error");
        return new DiagnosticItem
        {
            Id = "driver-secure-boot",
            Category = "Driver Restrictions",
            Title = "Secure Boot state",
            Summary = "Secure Boot can prevent certain unsigned or non-compliant drivers from loading.",
            Evidence = enabled ? "Secure Boot is enabled." : string.IsNullOrWhiteSpace(error) ? "Secure Boot is disabled or unsupported." : error,
            Recommendation = "This is primarily a driver compatibility check. It is not toggled from this tool.",
            Status = enabled ? DiagnosticStatus.Info : DiagnosticStatus.Warning,
            Severity = DiagnosticSeverity.Moderate
        };
    }

    private static DiagnosticItem CreateWindowsVersionDiagnostic()
    {
        string productName = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion", "ProductName", "Windows") as string ?? "Windows";
        string displayVersion = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion", "DisplayVersion", "Unknown") as string ?? "Unknown";
        string build = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion", "CurrentBuildNumber", "Unknown") as string ?? "Unknown";

        return new DiagnosticItem
        {
            Id = "os-version",
            Category = "Driver Restrictions",
            Title = "Windows build / compatibility baseline",
            Summary = "Very old builds can break drivers, DirectX features, TLS defaults, or runtime installers.",
            Evidence = $"{productName} {displayVersion} (Build {build})",
            Recommendation = "If the app has a minimum Windows build requirement, compare it against this machine.",
            Status = DiagnosticStatus.Info,
            Severity = DiagnosticSeverity.Info
        };
    }

    private async Task<DiagnosticItem> CreateGpuDriverDiagnosticAsync(CancellationToken cancellationToken)
    {
        CommandExecutionResult result = await _commandRunner.RunPowerShellAsync(
            "Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion | ConvertTo-Json -Compress",
            false,
            cancellationToken).ConfigureAwait(false);

        string evidence = result.Success ? result.StandardOutput : "Unable to query video controller information.";
        bool basicAdapter = evidence.Contains("Microsoft Basic", StringComparison.OrdinalIgnoreCase);
        return new DiagnosticItem
        {
            Id = "dependency-gpu-driver",
            Category = "Dependencies",
            Title = "GPU driver presence",
            Summary = "Apps using DirectX, hardware rendering, overlays, or GPU compute often fail on generic display drivers.",
            Evidence = evidence,
            Recommendation = "If rendering or startup fails, install a current GPU driver from the hardware vendor.",
            Status = basicAdapter ? DiagnosticStatus.Warning : DiagnosticStatus.Info,
            Severity = basicAdapter ? DiagnosticSeverity.High : DiagnosticSeverity.Info
        };
    }

    private IEnumerable<DiagnosticItem> CreateRuntimeDiagnostics(IReadOnlyList<InstallPackage> packages, TargetApplicationContext target)
    {
        List<DiagnosticItem> diagnostics = [];
        List<InstallPackage> missingPackages = packages.Where(item => !item.IsInstalled).ToList();
        if (missingPackages.Count > 0)
        {
            DiagnosticItem missingRuntimeItem = new()
            {
                Id = "runtime-missing-packages",
                Category = "Runtime Dependencies",
                Title = "Common runtime packages",
                Summary = "Missing VC++, .NET, DirectX, or WebView2 packages are one of the most common reasons apps fail to start.",
                Evidence = string.Join(Environment.NewLine, missingPackages.Select(item => $"{item.DisplayName}: {item.Evidence}")),
                Recommendation = "Install the missing packages from the Installers tab or use Install Missing Packages.",
                Status = DiagnosticStatus.Failed,
                Severity = DiagnosticSeverity.Critical
            };

            foreach (InstallPackage package in missingPackages.Take(3))
            {
                missingRuntimeItem.Actions.Add(new DiagnosticAction
                {
                    ActionId = $"install:{package.Id}",
                    Kind = ActionKind.InstallPackage,
                    Title = $"Install {package.DisplayName}",
                    Hint = package.Description,
                    Payload = package.Id,
                    RequiresElevation = package.RequiresElevation,
                    RequiresRestart = package.RequiresRestart
                });
            }

            diagnostics.Add(missingRuntimeItem);
        }
        else
        {
            diagnostics.Add(new DiagnosticItem
            {
                Id = "runtime-missing-packages",
                Category = "Runtime Dependencies",
                Title = "Common runtime packages",
                Summary = "The common runtime bundle from the manual guide is present.",
                Evidence = "Visual C++, .NET, WebView2, and DirectX package checks passed.",
                Recommendation = "If the app still fails, continue with file-specific and event-log diagnostics.",
                Status = DiagnosticStatus.Passed,
                Severity = DiagnosticSeverity.Info
            });
        }

        if (target.Exists)
        {
            diagnostics.Add(new DiagnosticItem
            {
                Id = "dependency-architecture",
                Category = "Dependencies",
                Title = "Target application architecture",
                Summary = "Architecture mismatches and invalid binaries frequently surface as 0xc000007b launch failures.",
                Evidence = $"{target.Architecture} executable. Managed assembly: {target.IsManaged}.",
                Recommendation = "If the app is x86, make sure x86 runtimes are installed. If it is x64, prefer x64 runtimes and helpers.",
                Status = target.Architecture == ArchitectureKind.Unknown ? DiagnosticStatus.Warning : DiagnosticStatus.Info,
                Severity = target.Architecture == ArchitectureKind.Unknown ? DiagnosticSeverity.High : DiagnosticSeverity.Info
            });

            diagnostics.Add(new DiagnosticItem
            {
                Id = "dependency-common-dlls",
                Category = "Dependencies",
                Title = "Common runtime DLL availability",
                Summary = "Missing runtime DLLs like VCRUNTIME140.dll or WebView2Loader.dll can prevent startup immediately.",
                Evidence = target.MissingRuntimeDlls.Count == 0
                    ? "Common runtime DLL probes succeeded."
                    : $"Missing or unresolved DLLs: {string.Join(", ", target.MissingRuntimeDlls)}",
                Recommendation = "Install the related runtime package when a DLL from that runtime family is missing.",
                Status = target.MissingRuntimeDlls.Count == 0 ? DiagnosticStatus.Passed : DiagnosticStatus.Failed,
                Severity = target.MissingRuntimeDlls.Count == 0 ? DiagnosticSeverity.Info : DiagnosticSeverity.Critical
            });
        }

        return diagnostics;
    }

    private async Task<IEnumerable<DiagnosticItem>> CreateNetworkDiagnosticsAsync(string serverUrl, CancellationToken cancellationToken)
    {
        List<DiagnosticItem> diagnostics = [];
        bool networkAvailable = NetworkInterface.GetIsNetworkAvailable();

        diagnostics.Add(new DiagnosticItem
        {
            Id = "network-adapter",
            Category = "Network / Login",
            Title = "Internet connectivity baseline",
            Summary = "A disconnected machine cannot reach login, CDN, or update services.",
            Evidence = networkAvailable ? "At least one network interface is currently reported as available." : "Windows reports no active network availability.",
            Recommendation = "Reconnect networking before testing login or update failures.",
            Status = networkAvailable ? DiagnosticStatus.Passed : DiagnosticStatus.Failed,
            Severity = networkAvailable ? DiagnosticSeverity.Info : DiagnosticSeverity.Critical
        });

        bool proxyEnabled = TryReadProxyEnabled();
        string? vpnEvidence = DetectVpnAdapters();
        diagnostics.Add(new DiagnosticItem
        {
            Id = "network-proxy",
            Category = "Network / Login",
            Title = "Proxy / VPN interference",
            Summary = "Proxies and VPN adapters can break routing, TLS, or local login callbacks.",
            Evidence = proxyEnabled
                ? "Windows internet settings report an active proxy."
                : vpnEvidence ?? "No proxy detected and no common VPN adapters were found.",
            Recommendation = "If login or updates fail, try without a proxy or VPN and retest.",
            Status = proxyEnabled || vpnEvidence is not null ? DiagnosticStatus.Warning : DiagnosticStatus.Passed,
            Severity = DiagnosticSeverity.Moderate
        });

        string timeServiceStatus = GetWindowsTimeServiceStatus();
        bool timeServiceRunning = timeServiceStatus.Equals("Running", StringComparison.OrdinalIgnoreCase);
        diagnostics.Add(new DiagnosticItem
        {
            Id = "network-time",
            Category = "Network / Login",
            Title = "System time / certificate baseline",
            Summary = "Incorrect time or a stopped Windows Time service can break SSL/TLS handshakes and token validation.",
            Evidence = $"Local time: {DateTime.Now:F}. Windows Time service: {timeServiceStatus}.",
            Recommendation = "Ensure the clock is correct and the Windows Time service is running before troubleshooting SSL failures.",
            Status = timeServiceRunning ? DiagnosticStatus.Passed : DiagnosticStatus.Warning,
            Severity = DiagnosticSeverity.Moderate
        });

        if (!string.IsNullOrWhiteSpace(serverUrl) && Uri.TryCreate(serverUrl, UriKind.Absolute, out Uri? uri))
        {
            string host = uri.Host;
            IPHostEntry? dnsResult = null;
            try
            {
                dnsResult = await Dns.GetHostEntryAsync(host, cancellationToken).ConfigureAwait(false);
            }
            catch
            {
            }

            diagnostics.Add(new DiagnosticItem
            {
                Id = "network-dns",
                Category = "Network / Login",
                Title = "DNS resolution",
                Summary = "If DNS fails, the app cannot resolve login or API hosts.",
                Evidence = dnsResult is null
                    ? $"Unable to resolve {host}."
                    : $"{host} resolved to {string.Join(", ", dnsResult.AddressList.Select(address => address.ToString()))}.",
                Recommendation = "Fix local DNS or use a known-good resolver before retrying the app.",
                Status = dnsResult is null ? DiagnosticStatus.Failed : DiagnosticStatus.Passed,
                Severity = dnsResult is null ? DiagnosticSeverity.Critical : DiagnosticSeverity.Info
            });

            try
            {
                using HttpClient client = new() { Timeout = TimeSpan.FromSeconds(8) };
                HttpResponseMessage response = await client.GetAsync(uri, cancellationToken).ConfigureAwait(false);
                diagnostics.Add(new DiagnosticItem
                {
                    Id = "network-server",
                    Category = "Network / Login",
                    Title = "Server reachability",
                    Summary = "Directly confirms whether the configured service endpoint is reachable from this machine.",
                    Evidence = $"GET {uri} returned {(int)response.StatusCode} {response.StatusCode}.",
                    Recommendation = "If this request fails in the app but not here, compare firewall, proxy, and TLS settings.",
                    Status = response.IsSuccessStatusCode || (int)response.StatusCode < 500 ? DiagnosticStatus.Passed : DiagnosticStatus.Warning,
                    Severity = response.IsSuccessStatusCode || (int)response.StatusCode < 500 ? DiagnosticSeverity.Info : DiagnosticSeverity.High
                });
            }
            catch (Exception ex)
            {
                diagnostics.Add(new DiagnosticItem
                {
                    Id = "network-server",
                    Category = "Network / Login",
                    Title = "Server reachability",
                    Summary = "Directly confirms whether the configured service endpoint is reachable from this machine.",
                    Evidence = ex.Message,
                    Recommendation = "If the server cannot be reached, fix connectivity, DNS, certificate, or firewall issues first.",
                    Status = DiagnosticStatus.Failed,
                    Severity = DiagnosticSeverity.Critical
                });
            }
        }

        return diagnostics;
    }

    private IEnumerable<DiagnosticItem> CreatePermissionDiagnostics(TargetApplicationContext target)
    {
        List<DiagnosticItem> diagnostics =
        [
            new DiagnosticItem
            {
                Id = "permission-admin",
                Category = "Permissions",
                Title = "Running elevated",
                Summary = "Some installers, updaters, and protected directories require administrator rights.",
                Evidence = CommandRunner.IsProcessElevated() ? "The troubleshooter is running as administrator." : "The troubleshooter is running without administrator rights.",
                Recommendation = "If file operations or toggles fail, restart the troubleshooter as administrator.",
                Status = CommandRunner.IsProcessElevated() ? DiagnosticStatus.Passed : DiagnosticStatus.Warning,
                Severity = DiagnosticSeverity.Moderate
            }
        ];

        if (!target.Exists)
        {
            return diagnostics;
        }

        diagnostics.Add(new DiagnosticItem
        {
            Id = "permission-location",
            Category = "Permissions",
            Title = "Target app location risk",
            Summary = "Downloads, Desktop, and Program Files often introduce reputation, ACL, or virtualization issues.",
            Evidence = target.IsUnderProgramFiles
                ? "The app is inside Program Files."
                : target.IsUnderUserContentFolder
                    ? "The app is inside Desktop, Downloads, or Documents."
                    : "The app is outside the most common risk locations.",
            Recommendation = "For cleaner testing, move the app to a simple writable folder like C:\\Aegis\\Apps\\TargetName.",
            Status = target.IsUnderProgramFiles || target.IsUnderUserContentFolder ? DiagnosticStatus.Warning : DiagnosticStatus.Passed,
            Severity = DiagnosticSeverity.Moderate
        });

        diagnostics.Add(new DiagnosticItem
        {
            Id = "permission-write-access",
            Category = "Permissions",
            Title = "Folder write permission",
            Summary = "If the app cannot write its own cache, config, or logs, startup can fail immediately.",
            Evidence = target.DirectoryWritable
                ? "A temporary write probe succeeded in the application directory."
                : "The application directory did not allow a temporary write probe.",
            Recommendation = "Grant write access or move the app to a writable folder before retesting.",
            Status = target.DirectoryWritable ? DiagnosticStatus.Passed : DiagnosticStatus.Failed,
            Severity = target.DirectoryWritable ? DiagnosticSeverity.Info : DiagnosticSeverity.High
        });

        DiagnosticItem blockedFileItem = new()
        {
            Id = "permission-zone-identifier",
            Category = "Permissions",
            Title = "Downloaded file block",
            Summary = "Files marked as downloaded from the internet can be blocked by Windows reputation checks.",
            Evidence = target.IsBlockedFromInternet
                ? "Zone.Identifier is present on the selected file."
                : "The selected file does not carry a Zone.Identifier block marker.",
            Recommendation = "Use the built-in unblock action if the file came from the internet.",
            Status = target.IsBlockedFromInternet ? DiagnosticStatus.Warning : DiagnosticStatus.Passed,
            Severity = DiagnosticSeverity.High
        };

        if (target.IsBlockedFromInternet)
        {
            blockedFileItem.Actions.Add(new DiagnosticAction
            {
                ActionId = RemediationService.UnblockFileActionId,
                Kind = ActionKind.RunCommand,
                Title = "Unblock File",
                Hint = "Removes the Zone.Identifier marker from the selected file.",
                RequiresElevation = false
            });
        }

        diagnostics.Add(blockedFileItem);
        return diagnostics;
    }

    private IEnumerable<DiagnosticItem> CreateProcessDiagnostics(TargetApplicationContext target)
    {
        List<DiagnosticItem> diagnostics = [];
        if (!target.Exists)
        {
            return diagnostics;
        }

        diagnostics.Add(new DiagnosticItem
        {
            Id = "process-already-running",
            Category = "Process Conflicts",
            Title = "App already running",
            Summary = "An existing process instance can block a second launch or keep stale state alive.",
            Evidence = target.RunningProcesses > 0
                ? $"{target.RunningProcesses} process instance(s) named {target.ProcessName} are currently running."
                : $"{target.ProcessName} is not currently running.",
            Recommendation = "Terminate stale background instances before retrying the launch.",
            Status = target.RunningProcesses > 0 ? DiagnosticStatus.Warning : DiagnosticStatus.Passed,
            Severity = DiagnosticSeverity.Moderate
        });

        diagnostics.Add(new DiagnosticItem
        {
            Id = "process-locking",
            Category = "Process Conflicts",
            Title = "File locking processes",
            Summary = "Another process can keep the app or one of its files locked, preventing updates or startup.",
            Evidence = target.LockingProcesses.Count == 0
                ? "Restart Manager did not report locking processes for the selected executable."
                : $"Locking processes: {string.Join(", ", target.LockingProcesses)}",
            Recommendation = "Close the locking process or reboot before retesting.",
            Status = target.LockingProcesses.Count == 0 ? DiagnosticStatus.Passed : DiagnosticStatus.Warning,
            Severity = DiagnosticSeverity.High
        });

        string[] overlayProcesses = Process.GetProcesses()
            .Select(process => process.ProcessName)
            .Where(name => OverlayProcesses.Any(overlay => name.Contains(overlay, StringComparison.OrdinalIgnoreCase)))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        diagnostics.Add(new DiagnosticItem
        {
            Id = "process-overlays",
            Category = "Process Conflicts",
            Title = "Overlay / injector conflicts",
            Summary = "Overlays and hook-based tools can cause startup crashes, black screens, or input problems.",
            Evidence = overlayProcesses.Length == 0
                ? "No common overlay or injector-style processes were detected."
                : $"Detected overlay-style processes: {string.Join(", ", overlayProcesses)}",
            Recommendation = "Try with Discord, Steam, RTSS, Game Bar, OBS, and similar tools closed.",
            Status = overlayProcesses.Length == 0 ? DiagnosticStatus.Passed : DiagnosticStatus.Warning,
            Severity = DiagnosticSeverity.Moderate
        });

        return diagnostics;
    }

    private async Task<DiagnosticItem> CreateProtectionHistoryDiagnosticAsync(TargetApplicationContext target, CancellationToken cancellationToken)
    {
        if (!target.Exists)
        {
            return new DiagnosticItem
            {
                Id = "security-protection-history",
                Category = "Windows Security",
                Title = "Protection history correlation",
                Summary = "Protection history is only correlated when a target file is selected.",
                Evidence = "Select a target application to check Defender events against it.",
                Recommendation = "Browse to the app executable first.",
                Status = DiagnosticStatus.Info,
                Severity = DiagnosticSeverity.Info
            };
        }

        string escapedName = Regex.Escape(target.FileName);
        List<string> matches = await Task.Run(() =>
        {
            List<string> defenderEvents = [];
            try
            {
                EventLogQuery query = new("Microsoft-Windows-Windows Defender/Operational", PathType.LogName);
                using EventLogReader reader = new(query);
                for (EventRecord? record = reader.ReadEvent(); record != null; record = reader.ReadEvent())
                {
                    using (record)
                    {
                        string xml = record.ToXml();
                        if (Regex.IsMatch(xml, escapedName, RegexOptions.IgnoreCase))
                        {
                            defenderEvents.Add($"{record.TimeCreated:G}: Event {record.Id}");
                            if (defenderEvents.Count >= 5)
                            {
                                break;
                            }
                        }
                    }
                }
            }
            catch
            {
            }

            return defenderEvents;
        }, cancellationToken).ConfigureAwait(false);

        return new DiagnosticItem
        {
            Id = "security-protection-history",
            Category = "Windows Security",
            Title = "Protection history events",
            Summary = "Recent Defender events referencing the app often explain silent deletions or blocked launches.",
            Evidence = matches.Count == 0
                ? "No recent Defender operational events were matched to the target file name."
                : string.Join(Environment.NewLine, matches),
            Recommendation = "If events exist here, review or restore the file in Windows Security before deeper debugging.",
            Status = matches.Count == 0 ? DiagnosticStatus.Passed : DiagnosticStatus.Warning,
            Severity = matches.Count == 0 ? DiagnosticSeverity.Info : DiagnosticSeverity.High
        };
    }

    private static List<CrashEventInfo> ReadCrashEvents(string processName, string fileName, List<string> notes)
    {
        List<CrashEventInfo> items = [];
        try
        {
            EventLogQuery query = new("Application", PathType.LogName, "*[System[(EventID=1000 or EventID=1001)]]")
            {
                ReverseDirection = true
            };

            using EventLogReader reader = new(query);
            for (EventRecord? record = reader.ReadEvent(); record != null && items.Count < 12; record = reader.ReadEvent())
            {
                using (record)
                {
                    string xml = record.ToXml();
                    if (!xml.Contains(fileName, StringComparison.OrdinalIgnoreCase) &&
                        !xml.Contains(processName, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    items.Add(new CrashEventInfo
                    {
                        Timestamp = record.TimeCreated ?? DateTime.MinValue,
                        Source = record.ProviderName ?? "Application",
                        ApplicationName = ExtractXmlData(xml, "FaultingApplicationName") ?? fileName,
                        ModuleName = ExtractXmlData(xml, "FaultingModuleName") ?? ExtractXmlData(xml, "FaultingModulePath") ?? "Unknown",
                        ExceptionCode = NormalizeExceptionCode(ExtractXmlData(xml, "ExceptionCode")),
                        FaultOffset = ExtractXmlData(xml, "FaultOffset") ?? string.Empty,
                        Message = ExtractInterestingCrashSummary(xml)
                    });
                }
            }
        }
        catch (Exception ex)
        {
            notes.Add($"Crash event reader failed: {ex.Message}");
        }

        return items;
    }

    private static DiagnosticItem CreateCrashEventSummary(IReadOnlyList<CrashEventInfo> crashEvents)
    {
        if (crashEvents.Count == 0)
        {
            return new DiagnosticItem
            {
                Id = "crash-events",
                Category = "Crash / Event Viewer",
                Title = "Recent crash events",
                Summary = "No recent Application Error or Windows Error Reporting events were matched to the target app.",
                Evidence = "No relevant crash events found.",
                Recommendation = "If the app still fails, reproduce the issue and run diagnostics again.",
                Status = DiagnosticStatus.Passed,
                Severity = DiagnosticSeverity.Info
            };
        }

        CrashEventInfo latest = crashEvents[0];
        string explanation = latest.ExceptionCode switch
        {
            "0xc000007b" => "Architecture or runtime mismatch is the most common cause.",
            "0xc0000135" => "A missing .NET or native runtime dependency is likely.",
            "0xc0000005" => "Access violation or hook/injection conflict is likely.",
            "0xc0000142" => "DLL initialization failed during startup.",
            "0xc0000409" => "Stack buffer overrun or aggressive security instrumentation is likely.",
            "0xe0434352" => "The app likely threw a managed .NET exception.",
            _ => "Review the faulting module and runtime state for the clearest next step."
        };

        return new DiagnosticItem
        {
            Id = "crash-events",
            Category = "Crash / Event Viewer",
            Title = "Recent crash events",
            Summary = "Windows event logs contain crash evidence for the selected app.",
            Evidence = $"{latest.Timestamp:G} | {latest.ApplicationName} | {latest.ModuleName} | {latest.ExceptionCode}",
            Recommendation = explanation,
            Status = DiagnosticStatus.Failed,
            Severity = DiagnosticSeverity.Critical
        };
    }

    private static ArchitectureKind ReadPortableExecutableArchitecture(string filePath)
    {
        try
        {
            using FileStream stream = File.OpenRead(filePath);
            using BinaryReader reader = new(stream);
            if (reader.ReadUInt16() != 0x5A4D)
            {
                return ArchitectureKind.Unknown;
            }

            stream.Position = 0x3C;
            int peHeaderOffset = reader.ReadInt32();
            stream.Position = peHeaderOffset;
            if (reader.ReadUInt32() != 0x00004550)
            {
                return ArchitectureKind.Unknown;
            }

            ushort machine = reader.ReadUInt16();
            return machine switch
            {
                0x014c => ArchitectureKind.X86,
                0x8664 => ArchitectureKind.X64,
                0xAA64 => ArchitectureKind.Arm64,
                _ => ArchitectureKind.Unknown
            };
        }
        catch
        {
            return ArchitectureKind.Unknown;
        }
    }

    private static bool IsManagedAssembly(string filePath)
    {
        try
        {
            System.Reflection.AssemblyName.GetAssemblyName(filePath);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool HasZoneIdentifier(string filePath)
    {
        try
        {
            return File.Exists(filePath + ":Zone.Identifier");
        }
        catch
        {
            return false;
        }
    }

    private static bool ProbeDirectoryWrite(string directoryPath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(directoryPath) || !Directory.Exists(directoryPath))
            {
                return false;
            }

            string probePath = Path.Combine(directoryPath, $".aegis_probe_{Guid.NewGuid():N}.tmp");
            File.WriteAllText(probePath, "probe");
            File.Delete(probePath);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static IReadOnlyList<string> FindMissingRuntimeDlls(string directoryPath)
    {
        List<string> missing = [];
        foreach (string dllName in CommonRuntimeDlls)
        {
            string[] candidatePaths =
            [
                Path.Combine(directoryPath, dllName),
                Path.Combine(Environment.SystemDirectory, dllName),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.SystemX86), dllName)
            ];

            if (!candidatePaths.Any(File.Exists))
            {
                missing.Add(dllName);
            }
        }

        return missing;
    }

    private static bool TryReadBooleanJson(string json, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            using JsonDocument document = JsonDocument.Parse(json);
            if (document.RootElement.TryGetProperty(propertyName, out JsonElement property))
            {
                return property.ValueKind switch
                {
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.String when bool.TryParse(property.GetString(), out bool parsed) => parsed,
                    _ => false
                };
            }
        }
        catch
        {
        }

        return false;
    }

    private static int TryReadIntJson(string json, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return 0;
        }

        try
        {
            using JsonDocument document = JsonDocument.Parse(json);
            if (document.RootElement.TryGetProperty(propertyName, out JsonElement property))
            {
                if (property.TryGetInt32(out int value))
                {
                    return value;
                }

                if (property.ValueKind == JsonValueKind.String && int.TryParse(property.GetString(), out value))
                {
                    return value;
                }
            }
        }
        catch
        {
        }

        return 0;
    }

    private static string TryReadStringJson(string json, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return string.Empty;
        }

        try
        {
            using JsonDocument document = JsonDocument.Parse(json);
            if (document.RootElement.TryGetProperty(propertyName, out JsonElement property))
            {
                return property.GetString() ?? string.Empty;
            }
        }
        catch
        {
        }

        return string.Empty;
    }

    private static bool TryReadProxyEnabled()
    {
        object? value = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Internet Settings", "ProxyEnable", 0);
        return value is int intValue && intValue != 0;
    }

    private static string? DetectVpnAdapters()
    {
        string[] adapterNames = NetworkInterface.GetAllNetworkInterfaces()
            .Where(adapter =>
                adapter.Name.Contains("vpn", StringComparison.OrdinalIgnoreCase) ||
                adapter.Name.Contains("wireguard", StringComparison.OrdinalIgnoreCase) ||
                adapter.Name.Contains("openvpn", StringComparison.OrdinalIgnoreCase) ||
                adapter.Description.Contains("vpn", StringComparison.OrdinalIgnoreCase) ||
                adapter.Description.Contains("wireguard", StringComparison.OrdinalIgnoreCase))
            .Select(adapter => adapter.Name)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return adapterNames.Length == 0 ? null : $"Detected VPN-style adapters: {string.Join(", ", adapterNames)}";
    }

    private static string GetWindowsTimeServiceStatus()
    {
        try
        {
            using Process process = new()
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "sc.exe",
                    Arguments = "query W32Time",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                }
            };

            process.Start();
            string output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();

            string? stateLine = output.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries)
                .FirstOrDefault(line => line.Contains("STATE", StringComparison.OrdinalIgnoreCase));

            if (stateLine is not null)
            {
                if (stateLine.Contains("RUNNING", StringComparison.OrdinalIgnoreCase))
                {
                    return "Running";
                }

                if (stateLine.Contains("STOPPED", StringComparison.OrdinalIgnoreCase))
                {
                    return "Stopped";
                }
            }

            return "Unknown";
        }
        catch
        {
            return "Unknown";
        }
    }

    private static string ExtractBcdLine(string text, string key)
    {
        string? line = text.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault(item => item.Contains(key, StringComparison.OrdinalIgnoreCase));
        return line?.Trim() ?? "State not reported.";
    }

    private static string? ExtractXmlData(string xml, string name)
    {
        Match match = Regex.Match(xml, $"<Data Name=['\"]{Regex.Escape(name)}['\"]>(.*?)</Data>", RegexOptions.IgnoreCase);
        return match.Success ? WebUtility.HtmlDecode(match.Groups[1].Value) : null;
    }

    private static string ExtractInterestingCrashSummary(string xml)
    {
        string exception = NormalizeExceptionCode(ExtractXmlData(xml, "ExceptionCode"));
        string module = ExtractXmlData(xml, "FaultingModuleName") ?? "Unknown module";
        return string.IsNullOrWhiteSpace(exception) ? module : $"{module} | {exception}";
    }

    private static string NormalizeExceptionCode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return string.Empty;
        }

        return code.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? code : $"0x{code}";
    }

    private sealed class TargetApplicationContext
    {
        public static TargetApplicationContext Empty { get; } = new();

        public bool Exists { get; init; }
        public string FullPath { get; init; } = string.Empty;
        public string FileName { get; init; } = string.Empty;
        public string DirectoryPath { get; init; } = string.Empty;
        public string ProcessName { get; set; } = string.Empty;
        public ArchitectureKind Architecture { get; set; }
        public bool IsManaged { get; set; }
        public bool IsBlockedFromInternet { get; set; }
        public bool IsUnderProgramFiles { get; set; }
        public bool IsUnderUserContentFolder { get; set; }
        public bool DirectoryWritable { get; set; }
        public int RunningProcesses { get; set; }
        public IReadOnlyList<string> LockingProcesses { get; set; } = Array.Empty<string>();
        public IReadOnlyList<string> MissingRuntimeDlls { get; set; } = Array.Empty<string>();
    }
}
