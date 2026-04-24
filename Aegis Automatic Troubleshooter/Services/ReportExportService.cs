using System.Text.Json;
using System.IO;
using Aegis_Automatic_Troubleshooter.Models;

namespace Aegis_Automatic_Troubleshooter.Services;

public sealed class ReportExportService
{
    public async Task ExportAsync(TroubleshootingSnapshot snapshot, string outputPath, CancellationToken cancellationToken = default)
    {
        object document = new
        {
            generatedAtUtc = DateTime.UtcNow,
            snapshot.TargetApplicationPath,
            snapshot.ServerUrl,
            diagnostics = snapshot.Diagnostics.Select(item => new
            {
                item.Id,
                item.Category,
                item.Title,
                status = item.StatusLabel,
                severity = item.SeverityLabel,
                item.Summary,
                item.Evidence,
                item.Recommendation,
                actions = item.Actions.Select(action => new
                {
                    action.ActionId,
                    action.Title,
                    action.Hint,
                    action.RequiresElevation,
                    action.RequiresRestart
                })
            }),
            installPackages = snapshot.InstallPackages.Select(package => new
            {
                package.Id,
                package.DisplayName,
                package.Category,
                package.Description,
                package.IsInstalled,
                package.Evidence,
                package.RequiresRestart
            }),
            crashEvents = snapshot.CrashEvents,
            notes = snapshot.ActivityNotes
        };

        JsonSerializerOptions options = new()
        {
            WriteIndented = true
        };

        string json = JsonSerializer.Serialize(document, options);
        await File.WriteAllTextAsync(outputPath, json, cancellationToken).ConfigureAwait(false);
    }
}
