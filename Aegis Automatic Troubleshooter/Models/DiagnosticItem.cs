using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.Windows.Media;
using Aegis_Automatic_Troubleshooter.Infrastructure;

namespace Aegis_Automatic_Troubleshooter.Models;

public sealed class DiagnosticItem : ObservableObject
{
    private DiagnosticStatus _status;
    private DiagnosticSeverity _severity;
    private string _evidence = string.Empty;
    private string _recommendation = string.Empty;
    private string _summary = string.Empty;

    public DiagnosticItem()
    {
        Actions.CollectionChanged += HandleActionsChanged;
    }

    public string Id { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;

    public string Summary
    {
        get => _summary;
        set => SetProperty(ref _summary, value);
    }

    public string Evidence
    {
        get => _evidence;
        set => SetProperty(ref _evidence, value);
    }

    public string Recommendation
    {
        get => _recommendation;
        set => SetProperty(ref _recommendation, value);
    }

    public DiagnosticStatus Status
    {
        get => _status;
        set
        {
            if (SetProperty(ref _status, value))
            {
                RefreshVisuals();
            }
        }
    }

    public DiagnosticSeverity Severity
    {
        get => _severity;
        set
        {
            if (SetProperty(ref _severity, value))
            {
                OnPropertyChanged(nameof(SeverityLabel));
                OnPropertyChanged(nameof(SeverityIconGeometry));
            }
        }
    }

    public bool RequiresAttention => Status is DiagnosticStatus.Warning or DiagnosticStatus.Failed;
    public bool HasActions => Actions.Count > 0;
    public ObservableCollection<DiagnosticAction> Actions { get; } = [];

    public string StatusLabel => Status switch
    {
        DiagnosticStatus.Passed => "Passed",
        DiagnosticStatus.Warning => "Warning",
        DiagnosticStatus.Failed => "Failed",
        _ => "Info"
    };

    public Geometry StatusIconGeometry => Status switch
    {
        DiagnosticStatus.Passed => Geometry.Parse("M8.5,13.5 L11,16 L16.5,8.5 M12,2 L20,6 V12 C20,17 16.5,20 12,22 C7.5,20 4,17 4,12 V6 Z"),
        DiagnosticStatus.Warning => Geometry.Parse("M12,3 L21,19 H3 Z M12,8 V13 M12,16 V17"),
        DiagnosticStatus.Failed => Geometry.Parse("M7,7 L17,17 M17,7 L7,17 M12,2 L20,6 V12 C20,17 16.5,20 12,22 C7.5,20 4,17 4,12 V6 Z"),
        _ => Geometry.Parse("M12,8 V12 M12,16 V16.5 M12,2 C17.5,2 22,6.5 22,12 C22,17.5 17.5,22 12,22 C6.5,22 2,17.5 2,12 C2,6.5 6.5,2 12,2")
    };

    public Geometry SeverityIconGeometry => Severity switch
    {
        DiagnosticSeverity.Critical => Geometry.Parse("M12,2 L21,7 V12 C21,17 17,21 12,22 C7,21 3,17 3,12 V7 Z M8,8 L16,16 M16,8 L8,16"),
        DiagnosticSeverity.High => Geometry.Parse("M12,3 L21,19 H3 Z M12,8 V13 M12,16 V17"),
        DiagnosticSeverity.Moderate => Geometry.Parse("M4,12 H20 M12,4 V20 M6,6 L18,18 M18,6 L6,18"),
        _ => Geometry.Parse("M12,8 V12 M12,16 V16.5 M12,2 C17.5,2 22,6.5 22,12 C22,17.5 17.5,22 12,22 C6.5,22 2,17.5 2,12 C2,6.5 6.5,2 12,2")
    };

    public string SeverityLabel => Severity switch
    {
        DiagnosticSeverity.Critical => "Critical",
        DiagnosticSeverity.High => "High",
        DiagnosticSeverity.Moderate => "Moderate",
        _ => "Info"
    };

    public Brush StatusBrush => Status switch
    {
        DiagnosticStatus.Passed => new SolidColorBrush(Color.FromRgb(68, 196, 122)),
        DiagnosticStatus.Warning => new SolidColorBrush(Color.FromRgb(244, 184, 78)),
        DiagnosticStatus.Failed => new SolidColorBrush(Color.FromRgb(228, 87, 96)),
        _ => new SolidColorBrush(Color.FromRgb(119, 154, 255))
    };

    public Brush StatusSurfaceBrush => Status switch
    {
        DiagnosticStatus.Passed => new SolidColorBrush(Color.FromArgb(32, 68, 196, 122)),
        DiagnosticStatus.Warning => new SolidColorBrush(Color.FromArgb(28, 244, 184, 78)),
        DiagnosticStatus.Failed => new SolidColorBrush(Color.FromArgb(34, 228, 87, 96)),
        _ => new SolidColorBrush(Color.FromArgb(26, 119, 154, 255))
    };

    private void RefreshVisuals()
    {
        OnPropertyChanged(nameof(StatusLabel));
        OnPropertyChanged(nameof(StatusBrush));
        OnPropertyChanged(nameof(StatusSurfaceBrush));
        OnPropertyChanged(nameof(StatusIconGeometry));
        OnPropertyChanged(nameof(RequiresAttention));
    }

    private void HandleActionsChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        OnPropertyChanged(nameof(HasActions));
    }
}
