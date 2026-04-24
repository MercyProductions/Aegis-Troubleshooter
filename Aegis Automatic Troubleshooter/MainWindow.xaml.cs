using System.Diagnostics;
using Microsoft.Win32;
using Aegis_Automatic_Troubleshooter.Services;
using Aegis_Automatic_Troubleshooter.ViewModels;
using System.Windows;

namespace Aegis_Automatic_Troubleshooter;

public partial class MainWindow : Window
{
    private readonly MainWindowViewModel _viewModel;

    public MainWindow()
    {
        InitializeComponent();

        CommandRunner commandRunner = new();
        InstallerCatalogService installerCatalogService = new(commandRunner);
        TroubleshootingEngine engine = new(commandRunner, installerCatalogService);
        RemediationService remediationService = new(commandRunner);
        ReportExportService reportExportService = new();

        _viewModel = new MainWindowViewModel(engine, remediationService, reportExportService);
        DataContext = _viewModel;
    }

    private void MinimizeWindow_Click(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState.Minimized;
    }

    private void ToggleMaximizeWindow_Click(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;
    }

    private void CloseWindow_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void BrowseApp_Click(object sender, RoutedEventArgs e)
    {
        OpenFileDialog dialog = new()
        {
            Title = "Select the application executable to troubleshoot",
            Filter = "Executable files (*.exe)|*.exe|All files (*.*)|*.*",
            CheckFileExists = true
        };

        if (dialog.ShowDialog(this) == true)
        {
            _viewModel.SetSelectedApp(dialog.FileName);
        }
    }

    private void OpenGuide_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo(_viewModel.GuidePath) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Unable to open guide", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void ExportReport_Click(object sender, RoutedEventArgs e)
    {
        SaveFileDialog dialog = new()
        {
            Title = "Export troubleshooting report",
            Filter = "JSON report (*.json)|*.json",
            FileName = $"aegis-troubleshooter-report-{DateTime.Now:yyyyMMdd-HHmmss}.json"
        };

        if (dialog.ShowDialog(this) == true)
        {
            try
            {
                await _viewModel.ExportReportAsync(dialog.FileName);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "Unable to export report", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}
