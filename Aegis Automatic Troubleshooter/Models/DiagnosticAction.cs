using Aegis_Automatic_Troubleshooter.Infrastructure;

namespace Aegis_Automatic_Troubleshooter.Models;

public sealed class DiagnosticAction : ObservableObject
{
    private bool _isBusy;

    public string ActionId { get; init; } = string.Empty;
    public ActionKind Kind { get; init; }
    public string Title { get; set; } = string.Empty;
    public string Hint { get; set; } = string.Empty;
    public string? Payload { get; init; }
    public bool DesiredToggleState { get; init; }
    public bool RequiresElevation { get; init; }
    public bool RequiresRestart { get; init; }

    public bool IsBusy
    {
        get => _isBusy;
        set => SetProperty(ref _isBusy, value);
    }
}
