using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace Aegis_Automatic_Troubleshooter.Services;

public static class RestartManagerService
{
    private const int ErrorMoreData = 234;
    private const int RmRebootReasonNone = 0;
    private const int CchRmSessionKey = 32;

    [StructLayout(LayoutKind.Sequential)]
    private struct RmUniqueProcess
    {
        public int DwProcessId;
        public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
    }

    private enum RmAppType
    {
        Unknown = 0,
        MainWindow = 1,
        OtherWindow = 2,
        Service = 3,
        Explorer = 4,
        Console = 5,
        Critical = 1000
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct RmProcessInfo
    {
        public RmUniqueProcess Process;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string AppName;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string ServiceShortName;

        public RmAppType ApplicationType;
        public uint AppStatus;
        public uint TsSessionId;

        [MarshalAs(UnmanagedType.Bool)]
        public bool Restartable;
    }

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmStartSession(out uint sessionHandle, int sessionFlags, StringBuilder sessionKey);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmEndSession(uint sessionHandle);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmRegisterResources(
        uint sessionHandle,
        uint fileCount,
        string[]? fileNames,
        uint applicationCount,
        [In] RmUniqueProcess[]? applications,
        uint serviceCount,
        string[]? serviceNames);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmGetList(
        uint sessionHandle,
        out uint processInfoNeeded,
        ref uint processInfo,
        [In, Out] RmProcessInfo[]? affectedApplications,
        ref uint rebootReasons);

    public static IReadOnlyList<string> GetLockingProcesses(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            return Array.Empty<string>();
        }

        uint sessionHandle = 0;
        StringBuilder sessionKey = new(CchRmSessionKey + 1);
        int startResult = RmStartSession(out sessionHandle, 0, sessionKey);
        if (startResult != 0)
        {
            return Array.Empty<string>();
        }

        try
        {
            string[] resources = [filePath];
            int registerResult = RmRegisterResources(sessionHandle, (uint)resources.Length, resources, 0, null, 0, null);
            if (registerResult != 0)
            {
                return Array.Empty<string>();
            }

            uint needed = 0;
            uint count = 0;
            uint reasons = RmRebootReasonNone;
            int listResult = RmGetList(sessionHandle, out needed, ref count, null, ref reasons);
            if (listResult == ErrorMoreData)
            {
                RmProcessInfo[] processInfo = new RmProcessInfo[needed];
                count = needed;
                listResult = RmGetList(sessionHandle, out needed, ref count, processInfo, ref reasons);
                if (listResult == 0)
                {
                    return processInfo
                        .Take((int)count)
                        .Select(info => string.IsNullOrWhiteSpace(info.AppName)
                            ? TryResolveProcessName(info.Process.DwProcessId)
                            : $"{info.AppName} ({info.Process.DwProcessId})")
                        .Where(name => !string.IsNullOrWhiteSpace(name))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToArray();
                }
            }

            if (listResult != 0 && listResult != ErrorMoreData)
            {
                throw new Win32Exception(listResult);
            }

            return Array.Empty<string>();
        }
        finally
        {
            RmEndSession(sessionHandle);
        }
    }

    private static string TryResolveProcessName(int processId)
    {
        try
        {
            using Process process = Process.GetProcessById(processId);
            return $"{process.ProcessName} ({processId})";
        }
        catch
        {
            return $"PID {processId}";
        }
    }
}
