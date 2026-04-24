using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Input;
using System.Windows.Media;
using Aegis_Automatic_Troubleshooter.Infrastructure;
using Aegis_Automatic_Troubleshooter.Models;
using Aegis_Automatic_Troubleshooter.Services;

namespace Aegis_Automatic_Troubleshooter.ViewModels;

public sealed class MainWindowViewModel : ObservableObject
{
    private readonly TroubleshootingEngine _engine;
    private readonly RemediationService _remediationService;
    private readonly ReportExportService _reportExportService;

    private bool _isBusy;
    private string _selectedAppPath = string.Empty;
    private string _serverUrl = "https://localhost";
    private string _statusText = "Ready to run diagnostics.";
    private string _currentSection = "Home";
    private DateTime? _lastScanAt;
    private TroubleshootingSnapshot _lastSnapshot = new();

    public MainWindowViewModel(
        TroubleshootingEngine engine,
        RemediationService remediationService,
        ReportExportService reportExportService)
    {
        _engine = engine;
        _remediationService = remediationService;
        _reportExportService = reportExportService;

        RunDiagnosticsCommand = new AsyncRelayCommand(RunDiagnosticsAsync, () => !IsBusy);
        ExecuteDiagnosticActionCommand = new AsyncRelayCommand<DiagnosticAction>(ExecuteDiagnosticActionAsync, action => !IsBusy && action is not null);
        InstallPackageCommand = new AsyncRelayCommand<InstallPackage>(InstallPackageAsync, package => !IsBusy && package is not null);
        InstallMissingPackagesCommand = new AsyncRelayCommand(InstallMissingPackagesAsync, () => !IsBusy && MissingPackageCount > 0);
        NavigateSectionCommand = new RelayCommand<string>(NavigateSection);

        SeedGuideModules();
    }

    public ObservableCollection<DiagnosticItem> Diagnostics { get; } = [];
    public ObservableCollection<InstallPackage> InstallPackages { get; } = [];
    public ObservableCollection<CrashEventInfo> CrashEvents { get; } = [];
    public ObservableCollection<string> ActivityNotes { get; } = [];
    public ObservableCollection<ScanHistoryEntry> ScanHistory { get; } = [];
    public ObservableCollection<GuideModule> GuideModules { get; } = [];

    public ICommand RunDiagnosticsCommand { get; }
    public ICommand ExecuteDiagnosticActionCommand { get; }
    public ICommand InstallPackageCommand { get; }
    public ICommand InstallMissingPackagesCommand { get; }
    public ICommand NavigateSectionCommand { get; }

    public string GuidePath => @"C:\Users\gabri\Desktop\Aegis\Troubleshooting\Troubleshooting Text Guide.txt";

    public string SelectedAppPath
    {
        get => _selectedAppPath;
        set
        {
            if (SetProperty(ref _selectedAppPath, value))
            {
                RefreshSelectionState();
            }
        }
    }

    public string ServerUrl
    {
        get => _serverUrl;
        set
        {
            if (SetProperty(ref _serverUrl, value))
            {
                OnPropertyChanged(nameof(ServerDisplayText));
            }
        }
    }

    public string StatusText
    {
        get => _statusText;
        set => SetProperty(ref _statusText, value);
    }

    public bool IsBusy
    {
        get => _isBusy;
        set
        {
            if (SetProperty(ref _isBusy, value))
            {
                OnPropertyChanged(nameof(BusyLabel));
                NotifyCommandStates();
            }
        }
    }

    public string CurrentSection
    {
        get => _currentSection;
        set
        {
            if (SetProperty(ref _currentSection, value))
            {
                RefreshSectionState();
            }
        }
    }

    public int PassedCount => Diagnostics.Count(item => item.Status == DiagnosticStatus.Passed);
    public int WarningCount => Diagnostics.Count(item => item.Status == DiagnosticStatus.Warning);
    public int FailedCount => Diagnostics.Count(item => item.Status == DiagnosticStatus.Failed);
    public int MissingPackageCount => InstallPackages.Count(item => !item.IsInstalled);
    public int NeedsAttentionCount => WarningCount + FailedCount;
    public int EvaluatedCount => Diagnostics.Count;

    public bool HasDiagnostics => Diagnostics.Count > 0;
    public bool HasCrashEvents => CrashEvents.Count > 0;
    public bool HasActivityNotes => ActivityNotes.Count > 0;
    public bool HasScanHistory => ScanHistory.Count > 0;
    public bool HasPriorityDiagnostics => PriorityDiagnostics.Count > 0;

    public bool IsHomeSection => SectionIs("Home");
    public bool IsResultsSection => SectionIs("Results");
    public bool IsInstallersSection => SectionIs("Installers");
    public bool IsActivitySection => SectionIs("Activity");
    public bool IsGuideSection => SectionIs("Guide");

    public string SelectedApplicationName => string.IsNullOrWhiteSpace(SelectedAppPath)
        ? "No application selected"
        : Path.GetFileName(SelectedAppPath);

    public string SelectedApplicationVersion => string.IsNullOrWhiteSpace(SelectedAppPath)
        ? "Choose the executable you want to validate."
        : TryGetVersionText(SelectedAppPath);

    public string SelectedApplicationLocation => string.IsNullOrWhiteSpace(SelectedAppPath)
        ? "Browse to the app that fails to launch, crashes instantly, or gets blocked by Windows."
        : (Path.GetDirectoryName(SelectedAppPath) ?? SelectedAppPath);

    public string ServerDisplayText => string.IsNullOrWhiteSpace(ServerUrl)
        ? "No server endpoint configured."
        : ServerUrl;

    public string AppVersion
    {
        get
        {
            Version? version = Assembly.GetExecutingAssembly().GetName().Version;
            return version is null
                ? "v1.0.0"
                : $"v{version.Major}.{version.Minor}.{version.Build}";
        }
    }

    public string LastScanLabel => _lastScanAt.HasValue
        ? _lastScanAt.Value.ToString("MMM d, yyyy h:mm tt")
        : "No scan has completed yet.";

    public string StatusHeadline => FailedCount > 0
        ? $"{FailedCount} blocking issue{Pluralize(FailedCount)} detected"
        : WarningCount > 0
            ? $"{WarningCount} review item{Pluralize(WarningCount)} detected"
            : HasDiagnostics
                ? "No critical issues detected"
                : "System ready for diagnostics";

    public string StatusToneLabel => FailedCount > 0
        ? "Action Required"
        : WarningCount > 0
            ? "Needs Review"
            : HasDiagnostics
                ? "Stable"
                : "Ready";

    public string StatusBadgeText => FailedCount > 0
        ? "!"
        : WarningCount > 0
            ? "?"
            : "OK";

    public Geometry StatusIconGeometry => FailedCount > 0
        ? Geometry.Parse("M7,7 L17,17 M17,7 L7,17 M12,2 L20,6 V12 C20,17 16.5,20 12,22 C7.5,20 4,17 4,12 V6 Z")
        : WarningCount > 0
            ? Geometry.Parse("M12,3 L21,19 H3 Z M12,8 V13 M12,16 V17")
            : Geometry.Parse("M8.5,13.5 L11,16 L16.5,8.5 M12,2 L20,6 V12 C20,17 16.5,20 12,22 C7.5,20 4,17 4,12 V6 Z");

    public string StatusSubtext => FailedCount > 0
        ? "The selected environment has one or more blockers that can prevent startup, login, or normal runtime behavior."
        : WarningCount > 0
            ? "The scan completed, but a few areas still need attention before calling the environment stable."
            : HasDiagnostics
                ? $"Last scan completed {LastScanLabel}."
                : "Run a full diagnostic pass to check security, runtimes, permissions, crashes, and network readiness.";

    public int ReadinessScore
    {
        get
        {
            int total = Diagnostics.Count;
            if (total == 0)
            {
                return 0;
            }

            double score = ((PassedCount * 1.0) + (WarningCount * 0.45)) / total * 100.0;
            return Math.Clamp((int)Math.Round(score), 0, 100);
        }
    }

    public string ReadinessScoreLabel => HasDiagnostics ? $"{ReadinessScore}%" : "--";

    public Brush StatusBrush => FailedCount > 0
        ? new SolidColorBrush(Color.FromRgb(255, 96, 96))
        : WarningCount > 0
            ? new SolidColorBrush(Color.FromRgb(255, 186, 88))
            : new SolidColorBrush(Color.FromRgb(124, 219, 136));

    public Brush StatusSurfaceBrush => FailedCount > 0
        ? new SolidColorBrush(Color.FromArgb(34, 255, 96, 96))
        : WarningCount > 0
            ? new SolidColorBrush(Color.FromArgb(32, 255, 186, 88))
            : new SolidColorBrush(Color.FromArgb(30, 124, 219, 136));

    public string PackageHeadline => MissingPackageCount > 0
        ? $"{MissingPackageCount} runtime package{Pluralize(MissingPackageCount)} still need installation"
        : "Tracked runtime packages look healthy";

    public string BusyLabel => IsBusy ? "Running" : "Ready";

    public IReadOnlyList<DiagnosticItem> PriorityDiagnostics => Diagnostics
        .Where(item => item.RequiresAttention)
        .OrderByDescending(item => SeverityRank(item.Severity))
        .ThenByDescending(item => item.Status == DiagnosticStatus.Failed)
        .Take(4)
        .ToList();

    public IReadOnlyList<string> ActivityPreview => ActivityNotes.Take(6).ToList();

    public void SetSelectedApp(string filePath)
    {
        SelectedAppPath = filePath;
        CurrentSection = "Home";
        StatusText = "Target application updated. Run diagnostics to refresh results.";
    }

    public async Task ExportReportAsync(string outputPath, CancellationToken cancellationToken = default)
    {
        await _reportExportService.ExportAsync(_lastSnapshot, outputPath, cancellationToken).ConfigureAwait(false);
        StatusText = $"Report exported to {outputPath}.";
    }

    private async Task RunDiagnosticsAsync()
    {
        try
        {
            IsBusy = true;
            StatusText = "Running full diagnostic scan...";
            TroubleshootingSnapshot snapshot = await _engine.RunAsync(SelectedAppPath, ServerUrl).ConfigureAwait(true);
            _lastSnapshot = snapshot;
            _lastScanAt = DateTime.Now;

            ReplaceCollection(Diagnostics, snapshot.Diagnostics);
            ReplaceCollection(InstallPackages, snapshot.InstallPackages);
            ReplaceCollection(CrashEvents, snapshot.CrashEvents);
            ReplaceCollection(ActivityNotes, snapshot.ActivityNotes);

            AppendScanHistory(snapshot);
            RefreshDashboardState();

            StatusText = $"Diagnostics completed. {FailedCount} failed, {WarningCount} warning, {PassedCount} passed.";
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task ExecuteDiagnosticActionAsync(DiagnosticAction? action)
    {
        if (action is null)
        {
            return;
        }

        if (action.Kind == ActionKind.InstallPackage && !string.IsNullOrWhiteSpace(action.Payload))
        {
            InstallPackage? package = InstallPackages.FirstOrDefault(item => item.Id.Equals(action.Payload, StringComparison.OrdinalIgnoreCase));
            if (package is not null)
            {
                CurrentSection = "Installers";
                await InstallPackageAsync(package).ConfigureAwait(true);
                return;
            }
        }

        try
        {
            IsBusy = true;
            action.IsBusy = true;
            CurrentSection = "Results";
            StatusText = $"Running {action.Title}...";
            CommandExecutionResult result = await _remediationService.ExecuteDiagnosticActionAsync(action, SelectedAppPath).ConfigureAwait(true);
            StatusText = result.Success
                ? $"{action.Title} completed. {result.Message}"
                : $"{action.Title} failed. {(!string.IsNullOrWhiteSpace(result.StandardError) ? result.StandardError : result.Message)}";
        }
        finally
        {
            action.IsBusy = false;
            IsBusy = false;
        }

        await RunDiagnosticsAsync().ConfigureAwait(true);
    }

    private async Task InstallPackageAsync(InstallPackage? package)
    {
        if (package is null)
        {
            return;
        }

        try
        {
            IsBusy = true;
            package.IsBusy = true;
            CurrentSection = "Installers";
            StatusText = $"Installing {package.DisplayName}...";
            CommandExecutionResult result = await _remediationService.InstallPackageAsync(package).ConfigureAwait(true);
            StatusText = result.Success
                ? $"{package.DisplayName} installation command finished."
                : $"{package.DisplayName} installation failed. {(!string.IsNullOrWhiteSpace(result.StandardError) ? result.StandardError : result.Message)}";
        }
        finally
        {
            package.IsBusy = false;
            IsBusy = false;
        }

        await RunDiagnosticsAsync().ConfigureAwait(true);
    }

    private async Task InstallMissingPackagesAsync()
    {
        CurrentSection = "Installers";

        foreach (InstallPackage package in InstallPackages.Where(item => !item.IsInstalled).ToArray())
        {
            await InstallPackageAsync(package).ConfigureAwait(true);
        }
    }

    private void NavigateSection(string? section)
    {
        if (string.IsNullOrWhiteSpace(section))
        {
            return;
        }

        CurrentSection = section;
    }

    private void RefreshSelectionState()
    {
        OnPropertyChanged(nameof(SelectedApplicationName));
        OnPropertyChanged(nameof(SelectedApplicationVersion));
        OnPropertyChanged(nameof(SelectedApplicationLocation));
    }

    private void RefreshSectionState()
    {
        OnPropertyChanged(nameof(IsHomeSection));
        OnPropertyChanged(nameof(IsResultsSection));
        OnPropertyChanged(nameof(IsInstallersSection));
        OnPropertyChanged(nameof(IsActivitySection));
        OnPropertyChanged(nameof(IsGuideSection));
    }

    private void RefreshDashboardState()
    {
        OnPropertyChanged(nameof(PassedCount));
        OnPropertyChanged(nameof(WarningCount));
        OnPropertyChanged(nameof(FailedCount));
        OnPropertyChanged(nameof(MissingPackageCount));
        OnPropertyChanged(nameof(NeedsAttentionCount));
        OnPropertyChanged(nameof(EvaluatedCount));
        OnPropertyChanged(nameof(HasDiagnostics));
        OnPropertyChanged(nameof(HasCrashEvents));
        OnPropertyChanged(nameof(HasActivityNotes));
        OnPropertyChanged(nameof(HasScanHistory));
        OnPropertyChanged(nameof(HasPriorityDiagnostics));
        OnPropertyChanged(nameof(LastScanLabel));
        OnPropertyChanged(nameof(StatusHeadline));
        OnPropertyChanged(nameof(StatusToneLabel));
        OnPropertyChanged(nameof(StatusBadgeText));
        OnPropertyChanged(nameof(StatusIconGeometry));
        OnPropertyChanged(nameof(StatusSubtext));
        OnPropertyChanged(nameof(StatusBrush));
        OnPropertyChanged(nameof(StatusSurfaceBrush));
        OnPropertyChanged(nameof(ReadinessScore));
        OnPropertyChanged(nameof(ReadinessScoreLabel));
        OnPropertyChanged(nameof(PackageHeadline));
        OnPropertyChanged(nameof(PriorityDiagnostics));
        OnPropertyChanged(nameof(ActivityPreview));
        NotifyCommandStates();
    }

    private void AppendScanHistory(TroubleshootingSnapshot snapshot)
    {
        int issueCount = FailedCount + WarningCount;
        string applicationName = string.IsNullOrWhiteSpace(snapshot.TargetApplicationPath)
            ? (string.IsNullOrWhiteSpace(SelectedAppPath) ? "System-wide scan" : Path.GetFileName(SelectedAppPath))
            : Path.GetFileName(snapshot.TargetApplicationPath);

        ScanHistory.Insert(0, new ScanHistoryEntry
        {
            Timestamp = _lastScanAt ?? DateTime.Now,
            ApplicationName = applicationName,
            ResultLabel = issueCount == 0 ? "No Issues" : issueCount >= 3 ? "Issues Found" : "Review Recommended",
            IssueCount = issueCount
        });

        while (ScanHistory.Count > 8)
        {
            ScanHistory.RemoveAt(ScanHistory.Count - 1);
        }
    }

    private void SeedGuideModules()
    {
        GuideModules.Clear();
        GuideModules.Add(new GuideModule
        {
            Badge = "SP",
            Title = "Security & Protection",
            Description = "Check Defender, SmartScreen, Controlled Folder Access, exploit protection, and firewall rules.",
            IconPathData = "M12,2 L20,6 V12 C20,17 16.5,20 12,22 C7.5,20 4,17 4,12 V6 Z M8.5,12.5 L11,15 L16,9"
        });
        GuideModules.Add(new GuideModule
        {
            Badge = "RT",
            Title = "Runtime Components",
            Description = "Verify Visual C++, .NET, DirectX, and WebView2 runtimes required by the application.",
            IconPathData = "M12,2 L20,6.5 V15.5 L12,22 L4,15.5 V6.5 Z M12,2 V22 M4,6.5 L12,11 L20,6.5 M4,15.5 L12,11 L20,15.5"
        });
        GuideModules.Add(new GuideModule
        {
            Badge = "DR",
            Title = "Driver & Low-Level",
            Description = "Review Secure Boot, code integrity, Memory Integrity, Test Signing, Hyper-V, and OS compatibility.",
            IconPathData = "M8,3 H16 V6 H19 V10 H22 V14 H19 V18 H16 V21 H8 V18 H5 V14 H2 V10 H5 V6 H8 Z M9,9 H15 V15 H9 Z"
        });
        GuideModules.Add(new GuideModule
        {
            Badge = "PM",
            Title = "Permissions",
            Description = "Check admin context, install location, writable folders, internet block state, and file access.",
            IconPathData = "M4,9 H20 V20 H4 Z M7,9 V6 C7,3.8 8.8,2 11,2 H13 C15.2,2 17,3.8 17,6 V9 M12,13 V16"
        });
        GuideModules.Add(new GuideModule
        {
            Badge = "CR",
            Title = "Crash Evidence",
            Description = "Read application crashes, faulting modules, exception codes, offsets, and Windows Error Reporting details.",
            IconPathData = "M5,3 H15 L20,8 V21 H5 Z M15,3 V8 H20 M8,13 H16 M8,17 H13 M10,8 L13,11 M13,8 L10,11"
        });
        GuideModules.Add(new GuideModule
        {
            Badge = "NW",
            Title = "Network & Login",
            Description = "Validate connectivity, DNS, proxies, VPNs, TLS time sync, and target server reachability.",
            IconPathData = "M12,2 C17.5,2 22,6.5 22,12 C22,17.5 17.5,22 12,22 C6.5,22 2,17.5 2,12 C2,6.5 6.5,2 12,2 M2,12 H22 M12,2 C14.5,5 16,8.5 16,12 C16,15.5 14.5,19 12,22 M12,2 C9.5,5 8,8.5 8,12 C8,15.5 9.5,19 12,22"
        });
        GuideModules.Add(new GuideModule
        {
            Badge = "PC",
            Title = "Process Conflicts",
            Description = "Detect stale background processes, overlays, locked files, port conflicts, and other runtime interference.",
            IconPathData = "M9,3 H15 V7 H19 V13 H15 V17 H9 V13 H5 V7 H9 Z M9,7 H15 M9,13 H15 M12,17 V21 M7,21 H17"
        });
    }

    private void NotifyCommandStates()
    {
        if (RunDiagnosticsCommand is AsyncRelayCommand runDiagnostics)
        {
            runDiagnostics.NotifyCanExecuteChanged();
        }

        if (ExecuteDiagnosticActionCommand is AsyncRelayCommand<DiagnosticAction> executeAction)
        {
            executeAction.NotifyCanExecuteChanged();
        }

        if (InstallPackageCommand is AsyncRelayCommand<InstallPackage> installPackage)
        {
            installPackage.NotifyCanExecuteChanged();
        }

        if (InstallMissingPackagesCommand is AsyncRelayCommand installMissing)
        {
            installMissing.NotifyCanExecuteChanged();
        }
    }

    private bool SectionIs(string section)
    {
        return string.Equals(CurrentSection, section, StringComparison.OrdinalIgnoreCase);
    }

    private static void ReplaceCollection<T>(ObservableCollection<T> target, IEnumerable<T> source)
    {
        target.Clear();
        foreach (T item in source)
        {
            target.Add(item);
        }
    }

    private static int SeverityRank(DiagnosticSeverity severity) => severity switch
    {
        DiagnosticSeverity.Critical => 4,
        DiagnosticSeverity.High => 3,
        DiagnosticSeverity.Moderate => 2,
        _ => 1
    };

    private static string TryGetVersionText(string filePath)
    {
        try
        {
            if (!File.Exists(filePath))
            {
                return "Selected path is no longer available.";
            }

            FileVersionInfo info = FileVersionInfo.GetVersionInfo(filePath);
            string? version = info.ProductVersion;
            return string.IsNullOrWhiteSpace(version)
                ? "Version information unavailable."
                : $"Version {version}";
        }
        catch
        {
            return "Version information unavailable.";
        }
    }

    private static string Pluralize(int count) => count == 1 ? string.Empty : "s";
}
