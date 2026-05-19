import { ScannerBase } from './scannerBase';
import { DiagnosticResult, Scanner, ScanContext } from './types';

type JsonRecord = Record<string, unknown>;

export class VirtualizationScanner extends ScannerBase implements Scanner {
  id = 'virtualization';
  name = 'Virtualization Layer Scanner';

  async run(context?: ScanContext): Promise<DiagnosticResult[]> {
    const query = await this.runPowerShell(`
      $processors = @(Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue |
        Select-Object Name, Manufacturer, VirtualizationFirmwareEnabled, VMMonitorModeExtensions, SecondLevelAddressTranslationExtensions)

      $computer = $null
      try {
        $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop |
          Select-Object Manufacturer, Model, HypervisorPresent
      } catch {}

      $features = @()
      $featureNames = @('Microsoft-Hyper-V-All', 'Microsoft-Hyper-V-Hypervisor', 'VirtualMachinePlatform', 'Windows-Hypervisor-Platform')
      foreach ($featureName in $featureNames) {
        try {
          $feature = Get-WindowsOptionalFeature -Online -FeatureName $featureName -ErrorAction Stop |
            Select-Object FeatureName, State
          if ($feature) { $features += $feature }
        } catch {}
      }

      $deviceGuard = $null
      try {
        $deviceGuard = Get-CimInstance -Namespace root\\Microsoft\\Windows\\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction Stop |
          Select-Object SecurityServicesConfigured, SecurityServicesRunning, VirtualizationBasedSecurityStatus, RequiredSecurityProperties, AvailableSecurityProperties
      } catch {}

      $systemInfo = $null
      try {
        $systemInfo = Get-CimInstance -Namespace root\\WMI -ClassName MS_SystemInformation -ErrorAction Stop |
          Select-Object KernelDMAProtection, HypervisorPresent
      } catch {}

      $memoryIntegrity = $null
      try {
        $memoryIntegrity = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' -Name Enabled -ErrorAction Stop).Enabled
      } catch {}

      $gpuControllers = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue |
        Select-Object Name, AdapterCompatibility, DriverVersion, PNPDeviceID)

      $partitionableGpu = @()
      if (Get-Command Get-VMHostPartitionableGpu -ErrorAction SilentlyContinue) {
        try {
          $partitionableGpu = @(Get-VMHostPartitionableGpu -ErrorAction Stop |
            Select-Object Name, ValidPartitionCounts, PartitionCount, TotalVRAM, AvailableVRAM)
        } catch {}
      }

      [ordered]@{
        Processors = $processors
        ComputerSystem = $computer
        OptionalFeatures = $features
        DeviceGuard = $deviceGuard
        SystemInformation = $systemInfo
        MemoryIntegrityEnabled = $memoryIntegrity
        GpuControllers = $gpuControllers
        PartitionableGpu = $partitionableGpu
      } | ConvertTo-Json -Depth 8
    `, 20000);

    const data = parseJson<JsonRecord>(query.stdout);
    if (!data) {
      return [this.createErrorResult('virtualization', 'Virtualization Layers', 'Virtualization Status', { message: 'Could not query virtualization layer status.' })];
    }

    const raw = JSON.stringify(data, null, 2);
    const processors = toRecordArray(data.Processors);
    const computer = asRecord(data.ComputerSystem);
    const features = toRecordArray(data.OptionalFeatures);
    const deviceGuard = asRecord(data.DeviceGuard);
    const systemInfo = asRecord(data.SystemInformation);
    const partitionableGpu = toRecordArray(data.PartitionableGpu);
    const gpuControllers = toRecordArray(data.GpuControllers);

    const results: DiagnosticResult[] = [];
    const virtualizationFirmware = anyBoolean(processors, 'VirtualizationFirmwareEnabled');
    const vmMonitor = anyBoolean(processors, 'VMMonitorModeExtensions');
    const slat = anyBoolean(processors, 'SecondLevelAddressTranslationExtensions');
    const cpuName = processors.map((processor) => processor.Name).filter(Boolean).join(', ') || 'Processor not reported';

    results.push(this.createLayerResult({
      id: 'cpu-virtualization-firmware',
      label: 'CPU Virtualization (VT-x / AMD-V)',
      value: virtualizationFirmware,
      enabledDetails: 'CPU virtualization is enabled in firmware.',
      disabledDetails: 'CPU virtualization is disabled in firmware.',
      unknownDetails: 'CPU virtualization firmware status was not reported.',
      evidence: `${cpuName}; VirtualizationFirmwareEnabled: ${formatValue(virtualizationFirmware)}`,
      impact: 'This is the hardware/firmware layer required before Hyper-V, VBS, Android emulators, and many VM tools can work.',
      recommendation: virtualizationFirmware ? 'No action required.' : 'Enable Intel VT-x or AMD-V in BIOS/UEFI.',
      rawOutput: raw,
      autoRepair: virtualizationFirmware === true ? undefined : { type: 'restart-firmware' }
    }));

    results.push(this.createLayerResult({
      id: 'cpu-vm-monitor-extensions',
      label: 'CPU VM Monitor Extensions',
      value: vmMonitor,
      enabledDetails: 'CPU VM monitor extensions are available.',
      disabledDetails: 'CPU VM monitor extensions are not available.',
      unknownDetails: 'CPU VM monitor extension status was not reported.',
      evidence: `VMMonitorModeExtensions: ${formatValue(vmMonitor)}`,
      impact: 'This CPU capability is used by hardware virtualization features.',
      recommendation: vmMonitor ? 'No action required.' : 'Check CPU support and BIOS/UEFI virtualization settings.',
      rawOutput: raw,
      autoRepair: vmMonitor === true ? undefined : { type: 'restart-firmware' }
    }));

    results.push(this.createLayerResult({
      id: 'cpu-slat',
      label: 'SLAT / Extended Page Tables',
      value: slat,
      enabledDetails: 'Second Level Address Translation is supported.',
      disabledDetails: 'Second Level Address Translation was not detected.',
      unknownDetails: 'SLAT status was not reported.',
      evidence: `SecondLevelAddressTranslationExtensions: ${formatValue(slat)}`,
      impact: 'SLAT, also called EPT on Intel and NPT/RVI on AMD, is required by Hyper-V and VBS on modern Windows.',
      recommendation: slat ? 'No action required.' : 'Use hardware that supports SLAT if Hyper-V or VBS is required.',
      rawOutput: raw
    }));

    const hypervisorPresent = asBoolean(computer?.HypervisorPresent ?? systemInfo?.HypervisorPresent);
    results.push(this.createLayerResult({
      id: 'windows-hypervisor-running',
      label: 'Windows Hypervisor Running',
      value: hypervisorPresent,
      enabledDetails: 'The Windows hypervisor is currently present.',
      disabledDetails: 'The Windows hypervisor is not currently present.',
      unknownDetails: 'Hypervisor runtime status was not reported.',
      evidence: `HypervisorPresent: ${formatValue(computer?.HypervisorPresent ?? systemInfo?.HypervisorPresent)}`,
      impact: 'This is the runtime hypervisor layer used by Hyper-V, VBS, WSL2, Windows Sandbox, and related isolation features.',
      recommendation: hypervisorPresent ? 'No action required if your app supports Hyper-V.' : 'Enable the needed Hyper-V platform features if your app requires them.',
      rawOutput: raw
    }));

    results.push(this.createFeatureResult({
      id: 'hyper-v-platform',
      label: 'Hyper-V Platform',
      featureNames: ['Microsoft-Hyper-V-All', 'Microsoft-Hyper-V-Hypervisor'],
      features,
      impact: 'Hyper-V is the Windows type-1 hypervisor feature stack.',
      recommendation: 'Enable or disable Hyper-V based on the target application requirements.',
      rawOutput: raw
    }));

    results.push(this.createFeatureResult({
      id: 'virtual-machine-platform',
      label: 'Virtual Machine Platform',
      featureNames: ['VirtualMachinePlatform'],
      features,
      impact: 'Virtual Machine Platform backs WSL2, emulator stacks, and some VM runtimes without the full Hyper-V manager.',
      recommendation: 'Enable this feature when required by WSL2, emulators, or VM-backed applications.',
      rawOutput: raw
    }));

    results.push(this.createFeatureResult({
      id: 'windows-hypervisor-platform',
      label: 'Windows Hypervisor Platform',
      featureNames: ['Windows-Hypervisor-Platform'],
      features,
      impact: 'Windows Hypervisor Platform allows third-party virtualization stacks to use the Windows hypervisor APIs.',
      recommendation: 'Enable this feature for virtualization software that integrates with the Windows hypervisor.',
      rawOutput: raw
    }));

    const vbsStatus = asNumber(deviceGuard?.VirtualizationBasedSecurityStatus);
    results.push(this.createLayerResult({
      id: 'vbs-status',
      label: 'VBS (Virtualization-Based Security)',
      value: vbsStatus === null ? null : vbsStatus === 2,
      enabledDetails: 'VBS is running.',
      disabledDetails: vbsStatus === 1 ? 'VBS is enabled but not running.' : 'VBS is disabled.',
      unknownDetails: 'VBS status was not reported.',
      evidence: `VirtualizationBasedSecurityStatus: ${formatValue(vbsStatus)} (${describeVbsStatus(vbsStatus)})`,
      impact: 'VBS is the Windows security isolation layer built on top of the hypervisor.',
      recommendation: vbsStatus === 2 ? 'No action required.' : 'Enable VBS only if your application or security baseline requires it.',
      rawOutput: raw
    }));

    const memoryIntegrity = asNumber(data.MemoryIntegrityEnabled);
    results.push(this.createLayerResult({
      id: 'virtualization-memory-integrity-hvci',
      label: 'Memory Integrity (HVCI Layer)',
      value: memoryIntegrity === null ? null : memoryIntegrity === 1,
      enabledDetails: 'Memory integrity is enabled.',
      disabledDetails: 'Memory integrity is disabled.',
      unknownDetails: 'Memory integrity status was not reported.',
      evidence: `HypervisorEnforcedCodeIntegrity Enabled: ${formatValue(memoryIntegrity)}`,
      impact: 'Memory Integrity is HVCI, a kernel code-integrity feature that depends on VBS.',
      recommendation: memoryIntegrity === 1 ? 'No action required.' : 'Enable Memory integrity if your app requires VBS-backed kernel isolation.',
      rawOutput: raw
    }));

    const runningServices = toNumberArray(deviceGuard?.SecurityServicesRunning);
    const configuredServices = toNumberArray(deviceGuard?.SecurityServicesConfigured);
    const hvciRunning = runningServices.includes(2);
    const credentialGuardRunning = runningServices.includes(1);
    results.push(this.createLayerResult({
      id: 'vbs-hvci-service',
      label: 'HVCI Security Service',
      value: hvciRunning,
      enabledDetails: 'The HVCI VBS service is running.',
      disabledDetails: configuredServices.includes(2) ? 'The HVCI VBS service is configured but not running.' : 'The HVCI VBS service is not configured.',
      unknownDetails: 'HVCI VBS service status was not reported.',
      evidence: `SecurityServicesRunning: ${formatValue(runningServices)}, SecurityServicesConfigured: ${formatValue(configuredServices)}`,
      impact: 'This is the VBS service layer behind Memory Integrity.',
      recommendation: hvciRunning ? 'No action required.' : 'Review VBS and Memory Integrity settings if HVCI is required.',
      rawOutput: raw
    }));

    results.push(this.createLayerResult({
      id: 'vbs-credential-guard',
      label: 'Credential Guard',
      value: credentialGuardRunning,
      enabledDetails: 'Credential Guard is running.',
      disabledDetails: configuredServices.includes(1) ? 'Credential Guard is configured but not running.' : 'Credential Guard is not configured.',
      unknownDetails: 'Credential Guard status was not reported.',
      evidence: `SecurityServicesRunning: ${formatValue(runningServices)}, SecurityServicesConfigured: ${formatValue(configuredServices)}`,
      impact: 'Credential Guard uses VBS to isolate secrets from the normal Windows environment.',
      recommendation: credentialGuardRunning ? 'No action required.' : 'Enable Credential Guard only if required by your security baseline.',
      rawOutput: raw
    }));

    const availableSecurityProperties = toNumberArray(deviceGuard?.AvailableSecurityProperties);
    const requiredSecurityProperties = toNumberArray(deviceGuard?.RequiredSecurityProperties);
    const kernelDma = asBoolean(systemInfo?.KernelDMAProtection);
    const dmaAvailable = availableSecurityProperties.includes(3) || kernelDma === true;
    results.push(this.createLayerResult({
      id: 'iommu-dma-remapping',
      label: 'IOMMU / VT-d DMA Remapping',
      value: dmaAvailable,
      enabledDetails: 'IOMMU-backed DMA remapping appears available.',
      disabledDetails: 'IOMMU-backed DMA remapping was not detected.',
      unknownDetails: 'IOMMU or DMA remapping status was not reported.',
      evidence: `KernelDMAProtection: ${formatValue(systemInfo?.KernelDMAProtection)}, AvailableSecurityProperties: ${formatValue(availableSecurityProperties)}`,
      impact: 'IOMMU, commonly exposed as Intel VT-d or AMD-Vi, is the hardware layer used for DMA isolation and some passthrough workflows.',
      recommendation: dmaAvailable ? 'No action required.' : 'Enable VT-d or AMD-Vi/IOMMU in BIOS/UEFI if required.',
      rawOutput: raw,
      autoRepair: dmaAvailable ? undefined : { type: 'restart-firmware' }
    }));

    results.push(this.createLayerResult({
      id: 'vbs-hyper-v-dma-protection',
      label: 'VBS / Hyper-V DMA Protection',
      value: kernelDma === null ? (availableSecurityProperties.includes(3) ? true : null) : kernelDma,
      enabledDetails: 'Kernel DMA protection is active or available.',
      disabledDetails: 'Kernel DMA protection is disabled.',
      unknownDetails: 'Kernel DMA protection status was not reported.',
      evidence: `KernelDMAProtection: ${formatValue(systemInfo?.KernelDMAProtection)}, RequiredSecurityProperties: ${formatValue(requiredSecurityProperties)}`,
      impact: 'This is the Windows protection layer that uses IOMMU/DMA remapping to reduce external DMA attack surface.',
      recommendation: kernelDma || availableSecurityProperties.includes(3) ? 'No action required.' : 'Review firmware virtualization and Kernel DMA Protection support.',
      rawOutput: raw,
      autoRepair: kernelDma || availableSecurityProperties.includes(3) ? undefined : { type: 'restart-firmware' }
    }));

    const kernelIsolation = vbsStatus === 2 || memoryIntegrity === 1 || hvciRunning;
    results.push(this.createLayerResult({
      id: 'kernel-isolation-layer',
      label: 'Kernel Isolation Layer',
      value: kernelIsolation,
      enabledDetails: 'A kernel isolation layer is active.',
      disabledDetails: 'No active kernel isolation layer was detected.',
      unknownDetails: 'Kernel isolation status was not reported.',
      evidence: `VBS: ${formatValue(vbsStatus)}, MemoryIntegrity: ${formatValue(memoryIntegrity)}, HVCI running: ${formatValue(hvciRunning)}`,
      impact: 'Kernel isolation is the security layer above CPU virtualization and the Windows hypervisor.',
      recommendation: kernelIsolation ? 'No action required.' : 'Enable VBS or Memory Integrity only when your program or policy requires it.',
      rawOutput: raw
    }));

    const gpuPassthroughSupported = partitionableGpu.length > 0;
    results.push(this.createLayerResult({
      id: 'gpu-passthrough-partitioning',
      label: 'GPU Passthrough / GPU-P',
      value: gpuPassthroughSupported,
      enabledDetails: 'At least one partitionable GPU was reported by Hyper-V.',
      disabledDetails: gpuControllers.length > 0 ? 'No partitionable GPU was reported by Hyper-V.' : 'No GPU controller was reported.',
      unknownDetails: 'GPU partitioning status was not reported.',
      evidence: gpuPassthroughSupported
        ? partitionableGpu.map((gpu) => `${formatValue(gpu.Name)} partitions: ${formatValue(gpu.ValidPartitionCounts)}`).join('\n')
        : `Detected GPUs: ${gpuControllers.map((gpu) => formatValue(gpu.Name)).join(', ') || 'none reported'}`,
      impact: 'GPU passthrough and GPU partitioning are VM/Hyper-V layers and are separate from normal GPU driver health.',
      recommendation: gpuPassthroughSupported ? 'No action required.' : 'Install Hyper-V management components and compatible GPU drivers if GPU-P is required.',
      rawOutput: raw
    }));

    return results;
  }

  private createFeatureResult(options: {
    id: string;
    label: string;
    featureNames: string[];
    features: JsonRecord[];
    impact: string;
    recommendation: string;
    rawOutput: string;
    autoRepair?: unknown;
  }): DiagnosticResult {
    const matching = options.features.filter((feature) => options.featureNames.includes(String(feature.FeatureName)));
    const enabled = matching.some((feature) => String(feature.State).toLowerCase() === 'enabled');
    const reported = matching.length > 0;
    return this.createLayerResult({
      id: options.id,
      label: options.label,
      value: reported ? enabled : null,
      enabledDetails: `${options.label} is enabled.`,
      disabledDetails: `${options.label} is disabled.`,
      unknownDetails: `${options.label} feature state was not reported.`,
      evidence: matching.length > 0
        ? matching.map((feature) => `${feature.FeatureName}: ${feature.State}`).join('\n')
        : `Features checked: ${options.featureNames.join(', ')}`,
      impact: options.impact,
      recommendation: options.recommendation,
      rawOutput: options.rawOutput
    });
  }

  private createLayerResult(options: {
    id: string;
    label: string;
    value: boolean | null;
    enabledDetails: string;
    disabledDetails: string;
    unknownDetails: string;
    evidence: string;
    impact: string;
    recommendation: string;
    rawOutput: string;
    autoRepair?: unknown;
  }): DiagnosticResult {
    const unknown = options.value === null;
    const enabled = options.value === true;
    const status = enabled ? 'passed' : 'warning';
    return this.createResult(
      options.id,
      'Virtualization Layers',
      options.label,
      status,
      enabled ? options.enabledDetails : unknown ? options.unknownDetails : options.disabledDetails,
      options.evidence,
      options.impact,
      options.recommendation,
      enabled ? 'low' : 'medium',
      options.rawOutput,
      options.autoRepair
    );
  }
}

function parseJson<T>(stdout: string): T | null {
  if (!stdout.trim()) return null;
  try {
    return JSON.parse(stdout) as T;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function toRecordArray(value: unknown): JsonRecord[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is JsonRecord => Boolean(asRecord(item)));
  const record = asRecord(value);
  return record ? [record] : [];
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'enabled') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'disabled') return false;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function anyBoolean(records: JsonRecord[], key: string): boolean | null {
  const values = records.map((record) => asBoolean(record[key])).filter((value): value is boolean => value !== null);
  if (values.length === 0) return null;
  return values.some(Boolean);
}

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(asNumber).filter((item): item is number => typeof item === 'number');
  }
  const single = asNumber(value);
  return typeof single === 'number' ? [single] : [];
}

function describeVbsStatus(value: number | null): string {
  if (value === 2) return 'running';
  if (value === 1) return 'enabled but not running';
  if (value === 0) return 'disabled';
  return 'not reported';
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'not reported';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
