using System.Windows.Media;

namespace Aegis_Automatic_Troubleshooter.Models;

public sealed class GuideModule
{
    public string Badge { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string IconPathData { get; init; } = string.Empty;

    public Geometry IconGeometry => Geometry.Parse(IconPathData);
}
