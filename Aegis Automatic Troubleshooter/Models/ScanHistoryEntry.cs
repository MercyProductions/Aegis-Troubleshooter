using System.Windows.Media;

namespace Aegis_Automatic_Troubleshooter.Models;

public sealed class ScanHistoryEntry
{
    public DateTime Timestamp { get; init; }
    public string ApplicationName { get; init; } = string.Empty;
    public string ResultLabel { get; init; } = string.Empty;
    public int IssueCount { get; init; }

    public string TimestampLabel => Timestamp.ToString("MMM d, yyyy h:mm tt");
    public string IssueLabel => IssueCount == 1 ? "1 issue" : $"{IssueCount} issues";

    public Brush ResultBrush => IssueCount switch
    {
        0 => new SolidColorBrush(Color.FromRgb(112, 207, 128)),
        >= 3 => new SolidColorBrush(Color.FromRgb(255, 96, 96)),
        _ => new SolidColorBrush(Color.FromRgb(255, 186, 88))
    };

    public Brush ResultSurfaceBrush => IssueCount switch
    {
        0 => new SolidColorBrush(Color.FromArgb(28, 112, 207, 128)),
        >= 3 => new SolidColorBrush(Color.FromArgb(32, 255, 96, 96)),
        _ => new SolidColorBrush(Color.FromArgb(30, 255, 186, 88))
    };
}
