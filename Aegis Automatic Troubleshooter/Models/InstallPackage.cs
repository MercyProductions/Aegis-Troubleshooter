using System.Windows.Media;
using Aegis_Automatic_Troubleshooter.Infrastructure;

namespace Aegis_Automatic_Troubleshooter.Models;

public sealed class InstallPackage : ObservableObject
{
    private bool _isInstalled;
    private bool _isBusy;
    private string _evidence = string.Empty;

    public string Id { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public InstallMethod InstallMethod { get; init; }
    public string WingetId { get; init; } = string.Empty;
    public string InstallArguments { get; init; } = string.Empty;
    public string CommandFileName { get; init; } = string.Empty;
    public string CommandArguments { get; init; } = string.Empty;
    public string DownloadUrl { get; init; } = string.Empty;
    public bool RequiresElevation { get; init; } = true;
    public bool RequiresRestart { get; init; }

    public bool IsInstalled
    {
        get => _isInstalled;
        set
        {
            if (SetProperty(ref _isInstalled, value))
            {
                OnPropertyChanged(nameof(StatusLabel));
                OnPropertyChanged(nameof(StatusBrush));
            }
        }
    }

    public bool IsBusy
    {
        get => _isBusy;
        set => SetProperty(ref _isBusy, value);
    }

    public string Evidence
    {
        get => _evidence;
        set => SetProperty(ref _evidence, value);
    }

    public string StatusLabel => IsInstalled ? "Installed" : "Missing";

    public Brush StatusBrush => IsInstalled
        ? new SolidColorBrush(Color.FromRgb(68, 196, 122))
        : new SolidColorBrush(Color.FromRgb(228, 87, 96));
}
