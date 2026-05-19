import { ScannerBase } from './scannerBase';
import { DiagnosticResult, Scanner, ScanContext } from './types';

type JsonRecord = Record<string, unknown>;

type FirewallProfile = {
  Name?: string;
  Enabled?: boolean | number | string;
  DefaultInboundAction?: string | number;
  DefaultOutboundAction?: string | number;
};

export class SecurityScanner extends ScannerBase implements Scanner {
  id = 'security';
  name = 'Security Scanner';

  async run(context?: ScanContext): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    const defenderStatus = await this.getJsonRecord('Get-MpComputerStatus | ConvertTo-Json -Depth 5');
    const defenderPrefs = await this.getJsonRecord('Get-MpPreference | ConvertTo-Json -Depth 6');

    results.push(...this.buildDefenderChecks(defenderStatus, defenderPrefs));
    results.push(...await this.buildFirewallChecks());
    results.push(...await this.buildReputationChecks());
    results.push(...await this.buildCoreIsolationChecks());
    results.push(...await this.buildUacAndServiceChecks());

    return results;
  }

  private buildDefenderChecks(status: JsonRecord | null, prefs: JsonRecord | null): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    const raw = JSON.stringify({ status, preferences: prefs }, null, 2);

    if (!status && !prefs) {
      return [
        this.createErrorResult('defender', 'Microsoft Defender', 'Microsoft Defender Status', {
          message: 'Could not query Get-MpComputerStatus or Get-MpPreference.'
        })
      ];
    }

    const antivirusEnabled = asBoolean(status?.AntivirusEnabled);
    results.push(this.createBooleanResult({
      id: 'defender-av',
      category: 'Microsoft Defender',
      label: 'Antivirus Core',
      value: antivirusEnabled,
      enabledDetails: 'Microsoft Defender antivirus core is enabled.',
      disabledDetails: 'Microsoft Defender antivirus core is disabled.',
      evidence: `AntivirusEnabled: ${formatValue(status?.AntivirusEnabled)}`,
      impact: antivirusEnabled ? 'System can perform malware scans.' : 'Malware detection may be fully disabled.',
      recommendation: antivirusEnabled ? 'No action required.' : 'Enable Microsoft Defender Antivirus.',
      disabledStatus: 'critical',
      rawOutput: raw
    }));

    const realTimeEnabled = asBoolean(status?.RealTimeProtectionEnabled) && !asBoolean(prefs?.DisableRealtimeMonitoring);
    results.push(this.createBooleanResult({
      id: 'defender-rtp',
      category: 'Microsoft Defender',
      label: 'Real-Time Protection',
      value: realTimeEnabled,
      enabledDetails: 'Real-time protection is active.',
      disabledDetails: 'Real-time protection is disabled.',
      evidence: `RealTimeProtectionEnabled: ${formatValue(status?.RealTimeProtectionEnabled)}, DisableRealtimeMonitoring: ${formatValue(prefs?.DisableRealtimeMonitoring)}`,
      impact: realTimeEnabled ? 'Files and processes are monitored as they run.' : 'Active threats may go undetected.',
      recommendation: realTimeEnabled ? 'No action required.' : 'Enable real-time protection.',
      disabledStatus: 'critical',
      rawOutput: raw,
      autoRepair: { type: 'defender-rtp' }
    }));

    const behaviorEnabled = asBoolean(status?.BehaviorMonitorEnabled) && !asBoolean(prefs?.DisableBehaviorMonitoring);
    results.push(this.createBooleanResult({
      id: 'defender-behavior-monitoring',
      category: 'Microsoft Defender',
      label: 'Behavior Monitoring',
      value: behaviorEnabled,
      enabledDetails: 'Behavior monitoring is enabled.',
      disabledDetails: 'Behavior monitoring is disabled.',
      evidence: `BehaviorMonitorEnabled: ${formatValue(status?.BehaviorMonitorEnabled)}, DisableBehaviorMonitoring: ${formatValue(prefs?.DisableBehaviorMonitoring)}`,
      impact: behaviorEnabled ? 'Suspicious runtime behavior can be detected.' : 'Suspicious behavior detection is reduced.',
      recommendation: behaviorEnabled ? 'No action required.' : 'Enable Microsoft Defender behavior monitoring.',
      disabledStatus: 'warning',
      rawOutput: raw
    }));

    const cloudReporting = asNumber(prefs?.MAPSReporting);
    results.push(this.createNumericStateResult({
      id: 'defender-cloud-protection',
      category: 'Microsoft Defender',
      label: 'Cloud-Delivered Protection',
      value: cloudReporting,
      enabledWhen: (value) => value > 0,
      enabledDetails: 'Cloud-delivered protection is enabled.',
      disabledDetails: 'Cloud-delivered protection is disabled.',
      evidence: `MAPSReporting: ${formatValue(prefs?.MAPSReporting)}, CloudBlockLevel: ${formatValue(prefs?.CloudBlockLevel)}`,
      impact: 'Cloud reputation data helps Defender block newly observed threats.',
      recommendation: cloudReporting && cloudReporting > 0 ? 'No action required.' : 'Enable cloud-delivered protection in Windows Security.',
      rawOutput: raw,
      autoRepair: { type: 'defender-cloud-protection' }
    }));

    const sampleConsent = asNumber(prefs?.SubmitSamplesConsent);
    results.push(this.createNumericStateResult({
      id: 'defender-sample-submission',
      category: 'Microsoft Defender',
      label: 'Automatic Sample Submission',
      value: sampleConsent,
      enabledWhen: (value) => value === 1 || value === 3,
      enabledDetails: 'Automatic sample submission is enabled.',
      disabledDetails: sampleConsent === 0 ? 'Sample submission is set to prompt.' : 'Automatic sample submission is disabled.',
      evidence: `SubmitSamplesConsent: ${formatValue(prefs?.SubmitSamplesConsent)}`,
      impact: 'Automatic sample submission improves cloud analysis of suspicious files.',
      recommendation: sampleConsent === 1 || sampleConsent === 3 ? 'No action required.' : 'Review automatic sample submission in Windows Security.',
      rawOutput: raw,
      autoRepair: { type: 'defender-sample-submission' }
    }));

    const tamperProtected = asBoolean(status?.IsTamperProtected);
    results.push(this.createBooleanResult({
      id: 'defender-tamper-protection',
      category: 'Microsoft Defender',
      label: 'Tamper Protection',
      value: tamperProtected,
      enabledDetails: 'Tamper Protection is enabled.',
      disabledDetails: 'Tamper Protection is disabled or not reported by this Windows build.',
      evidence: `IsTamperProtected: ${formatValue(status?.IsTamperProtected)}`,
      impact: tamperProtected ? 'Security settings are protected from unauthorized changes.' : 'Defender settings may be easier for software or policy changes to alter.',
      recommendation: tamperProtected ? 'No action required.' : 'Enable Tamper Protection in Windows Security when available.',
      disabledStatus: status?.IsTamperProtected === undefined ? 'warning' : 'critical',
      rawOutput: raw
    }));

    const devDriveValue = getFirstDefined(prefs, ['DevDriveProtectionEnabled', 'EnableDevDriveProtection']);
    const disableDevDriveValue = getFirstDefined(prefs, ['DisableDevDriveProtection']);
    const devDriveEnabled = devDriveValue !== undefined ? asBoolean(devDriveValue) : disableDevDriveValue !== undefined ? !asBoolean(disableDevDriveValue) : null;
    results.push(this.createNullableBooleanResult({
      id: 'defender-dev-drive-protection',
      category: 'Microsoft Defender',
      label: 'Dev Drive Protection',
      value: devDriveEnabled,
      enabledDetails: 'Dev Drive protection is enabled.',
      disabledDetails: 'Dev Drive protection is disabled.',
      unknownDetails: 'Dev Drive protection is not exposed by this Defender module or Windows build.',
      evidence: `DevDriveProtectionEnabled: ${formatValue(devDriveValue)}, DisableDevDriveProtection: ${formatValue(disableDevDriveValue)}`,
      impact: 'Dev Drive protection helps protect trusted developer volumes without disabling Defender globally.',
      recommendation: devDriveEnabled === null ? 'No action required unless this PC uses Dev Drives.' : devDriveEnabled ? 'No action required.' : 'Enable Dev Drive protection if this machine uses Dev Drives.',
      rawOutput: raw
    }));

    const pua = asNumber(prefs?.PUAProtection);
    results.push(this.createNumericStateResult({
      id: 'defender-pua-blocking',
      category: 'Microsoft Defender',
      label: 'Potentially Unwanted App Blocking',
      value: pua,
      enabledWhen: (value) => value === 1 || value === 2,
      enabledDetails: pua === 2 ? 'Potentially unwanted app blocking is in audit mode.' : 'Potentially unwanted app blocking is enabled.',
      disabledDetails: 'Potentially unwanted app blocking is disabled.',
      evidence: `PUAProtection: ${formatValue(prefs?.PUAProtection)}`,
      impact: 'PUA blocking can prevent bundled installers and low-reputation apps from running silently.',
      recommendation: pua === 1 || pua === 2 ? 'No action required.' : 'Enable reputation-based PUA blocking in Windows Security.',
      rawOutput: raw,
      autoRepair: { type: 'defender-pua-blocking' }
    }));

    const networkProtection = asNumber(prefs?.EnableNetworkProtection);
    results.push(this.createNumericStateResult({
      id: 'defender-network-protection',
      category: 'Microsoft Defender',
      label: 'Network Protection',
      value: networkProtection,
      enabledWhen: (value) => value === 1 || value === 2,
      enabledDetails: networkProtection === 2 ? 'Network protection is in audit mode.' : 'Network protection is enabled.',
      disabledDetails: 'Network protection is disabled.',
      evidence: `EnableNetworkProtection: ${formatValue(prefs?.EnableNetworkProtection)}`,
      impact: 'Network protection helps block connections to known malicious hosts.',
      recommendation: networkProtection === 1 || networkProtection === 2 ? 'No action required.' : 'Review Microsoft Defender network protection policy.',
      rawOutput: raw,
      autoRepair: { type: 'defender-network-protection' }
    }));

    const folderAccess = asNumber(prefs?.EnableControlledFolderAccess);
    results.push(this.createNumericStateResult({
      id: 'defender-controlled-folder-access',
      category: 'Microsoft Defender',
      label: 'Controlled Folder Access',
      value: folderAccess,
      enabledWhen: (value) => value === 1 || value === 2,
      enabledDetails: folderAccess === 2 ? 'Controlled folder access is in audit mode.' : 'Controlled folder access is enabled.',
      disabledDetails: 'Controlled folder access is disabled.',
      evidence: `EnableControlledFolderAccess: ${formatValue(prefs?.EnableControlledFolderAccess)}`,
      impact: 'Controlled folder access can block unauthorized writes to protected folders.',
      recommendation: folderAccess === 1 || folderAccess === 2 ? 'Allow-list Aegis if protected folder writes are blocked.' : 'No action required unless ransomware protection is desired.',
      rawOutput: raw,
      autoRepair: { type: 'defender-controlled-folder-access' }
    }));

    return results;
  }

  private async buildFirewallChecks(): Promise<DiagnosticResult[]> {
    const firewall = await this.runPowerShell('Get-NetFirewallProfile | Select-Object -Property Name, Enabled, DefaultInboundAction, DefaultOutboundAction | ConvertTo-Json -Depth 3');
    const profiles = parseJson<FirewallProfile | FirewallProfile[]>(firewall.stdout);

    if (!profiles) {
      return [this.createErrorResult('firewall', 'Firewall', 'Windows Firewall', { message: 'Could not parse firewall profiles.' })];
    }

    const profileList = Array.isArray(profiles) ? profiles : [profiles];
    const wantedProfiles = ['Domain', 'Private', 'Public'];

    return wantedProfiles.map((profileName) => {
      const profile = profileList.find((item) => String(item.Name).toLowerCase() === profileName.toLowerCase());
      if (!profile) {
        return this.createResult(
          `firewall-${profileName.toLowerCase()}`,
          'Firewall',
          `${profileName} Network Firewall`,
          'warning',
          `${profileName} firewall profile could not be found.`,
          firewall.stdout || 'No profile data returned.',
          'Firewall state could not be verified for this network profile.',
          'Run the troubleshooter as Administrator or review Windows Firewall manually.',
          'medium',
          firewall.stdout
        );
      }

      const enabled = profile.Enabled === true || profile.Enabled === 1 || profile.Enabled === 'True';
      return this.createResult(
        `firewall-${profileName.toLowerCase()}`,
        'Firewall',
        `${profileName} Network Firewall`,
        enabled ? 'passed' : 'critical',
        enabled ? `${profileName} firewall profile is enabled.` : `${profileName} firewall profile is disabled.`,
        `Profile: ${profile.Name}, Enabled: ${profile.Enabled}, Inbound: ${formatValue(profile.DefaultInboundAction)}, Outbound: ${formatValue(profile.DefaultOutboundAction)}`,
        enabled ? 'Network traffic is filtered for this profile.' : 'System may be vulnerable when connected to this network profile.',
        enabled ? 'No action required.' : `Enable the ${profileName} firewall profile.`,
        enabled ? 'low' : 'critical',
        firewall.stdout,
        { type: 'firewall', profile: profileName }
      );
    });
  }

  private async buildReputationChecks(): Promise<DiagnosticResult[]> {
    const script = `
      function Read-Value($Path, $Name) {
        try {
          $item = Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop
          return $item.$Name
        } catch {
          return $null
        }
      }
      [ordered]@{
        SmartAppControl = Read-Value 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy' 'VerifiedAndReputablePolicyState'
        CheckAppsAndFilesMachine = Read-Value 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' 'SmartScreenEnabled'
        CheckAppsAndFilesUser = Read-Value 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' 'SmartScreenEnabled'
        StoreAppsSmartScreen = Read-Value 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppHost' 'EnableWebContentEvaluation'
        EdgeSmartScreenPolicyMachine = Read-Value 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge' 'SmartScreenEnabled'
        EdgeSmartScreenPolicyUser = Read-Value 'HKCU:\\SOFTWARE\\Policies\\Microsoft\\Edge' 'SmartScreenEnabled'
        PhishingProtectionService = Read-Value 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\WTDS\\Components' 'ServiceEnabled'
        PhishingNotifyMalicious = Read-Value 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\WTDS\\Components' 'NotifyMalicious'
        PhishingNotifyPasswordReuse = Read-Value 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\WTDS\\Components' 'NotifyPasswordReuse'
        PhishingNotifyUnsafeApp = Read-Value 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\WTDS\\Components' 'NotifyUnsafeApp'
      } | ConvertTo-Json -Depth 3
    `;
    const query = await this.runPowerShell(script);
    const data = parseJson<JsonRecord>(query.stdout);

    if (!data) {
      return [this.createErrorResult('reputation', 'Reputation Protection', 'Reputation-Based Protection', { message: 'Could not read reputation settings.' })];
    }

    const results: DiagnosticResult[] = [];
    const smartAppControl = asNumber(data.SmartAppControl);
    const smartAppState = smartAppControl === 1 ? 'enabled' : smartAppControl === 2 ? 'evaluation mode' : smartAppControl === 0 ? 'disabled' : 'not reported';
    results.push(this.createResult(
      'smart-app-control',
      'Reputation Protection',
      'Smart App Control',
      smartAppControl === 1 || smartAppControl === 2 ? 'passed' : 'warning',
      `Smart App Control is ${smartAppState}.`,
      `VerifiedAndReputablePolicyState: ${formatValue(data.SmartAppControl)}`,
      'Smart App Control can block untrusted or unsigned apps before they run.',
      smartAppControl === 1 || smartAppControl === 2 ? 'No action required.' : 'Review Smart App Control in Windows Security.',
      smartAppControl === 0 ? 'medium' : 'low',
      query.stdout
    ));

    const appsAndFiles = data.CheckAppsAndFilesUser ?? data.CheckAppsAndFilesMachine;
    const appsAndFilesEnabled = appsAndFiles !== undefined && String(appsAndFiles).toLowerCase() !== 'off';
    results.push(this.createResult(
      'reputation-check-apps-files',
      'Reputation Protection',
      'Check Apps and Files',
      appsAndFiles === undefined ? 'warning' : appsAndFilesEnabled ? 'passed' : 'warning',
      appsAndFiles === undefined ? 'Check apps and files status was not reported.' : appsAndFilesEnabled ? 'Check apps and files is enabled.' : 'Check apps and files is disabled.',
      `SmartScreenEnabled: ${formatValue(appsAndFiles)}`,
      'This SmartScreen setting helps warn about low-reputation downloaded apps and files.',
      appsAndFilesEnabled ? 'No action required.' : 'Enable Check apps and files in Reputation-based protection settings.',
      'medium',
      query.stdout
    ));

    const edgeSmartScreen = data.EdgeSmartScreenPolicyUser ?? data.EdgeSmartScreenPolicyMachine;
    const edgeEnabled = asBoolean(edgeSmartScreen);
    results.push(this.createNullableBooleanResult({
      id: 'reputation-edge-smartscreen',
      category: 'Reputation Protection',
      label: 'SmartScreen for Microsoft Edge',
      value: edgeSmartScreen === undefined ? null : edgeEnabled,
      enabledDetails: 'Microsoft Edge SmartScreen policy is enabled.',
      disabledDetails: 'Microsoft Edge SmartScreen policy is disabled.',
      unknownDetails: 'Microsoft Edge SmartScreen is not managed by policy on this system.',
      evidence: `Edge SmartScreenEnabled policy: ${formatValue(edgeSmartScreen)}`,
      impact: 'Edge SmartScreen helps block known malicious sites and downloads.',
      recommendation: edgeSmartScreen === undefined ? 'Review the setting in Microsoft Edge if browser protection matters for this workflow.' : edgeEnabled ? 'No action required.' : 'Enable Microsoft Edge SmartScreen.',
      rawOutput: query.stdout
    }));

    const phishingService = asBoolean(data.PhishingProtectionService);
    const phishingSignals = [
      asBoolean(data.PhishingNotifyMalicious),
      asBoolean(data.PhishingNotifyPasswordReuse),
      asBoolean(data.PhishingNotifyUnsafeApp)
    ];
    const phishingKnown = data.PhishingProtectionService !== undefined || phishingSignals.some((value) => value !== null);
    const phishingEnabled = phishingService === true || phishingSignals.includes(true);
    results.push(this.createNullableBooleanResult({
      id: 'reputation-phishing-protection',
      category: 'Reputation Protection',
      label: 'Phishing Protection',
      value: phishingKnown ? phishingEnabled : null,
      enabledDetails: 'Enhanced phishing protection signals are enabled.',
      disabledDetails: 'Enhanced phishing protection appears disabled.',
      unknownDetails: 'Enhanced phishing protection status was not reported.',
      evidence: `ServiceEnabled: ${formatValue(data.PhishingProtectionService)}, NotifyMalicious: ${formatValue(data.PhishingNotifyMalicious)}, NotifyPasswordReuse: ${formatValue(data.PhishingNotifyPasswordReuse)}, NotifyUnsafeApp: ${formatValue(data.PhishingNotifyUnsafeApp)}`,
      impact: 'Phishing protection warns when Windows credentials are typed into unsafe apps or sites.',
      recommendation: phishingEnabled ? 'No action required.' : 'Review Enhanced phishing protection under Windows Security app and browser control.',
      rawOutput: query.stdout
    }));

    const storeSmartScreen = asBoolean(data.StoreAppsSmartScreen);
    results.push(this.createNullableBooleanResult({
      id: 'reputation-store-smartscreen',
      category: 'Reputation Protection',
      label: 'SmartScreen for Microsoft Store Apps',
      value: data.StoreAppsSmartScreen === undefined ? null : storeSmartScreen,
      enabledDetails: 'SmartScreen for Microsoft Store apps is enabled.',
      disabledDetails: 'SmartScreen for Microsoft Store apps is disabled.',
      unknownDetails: 'SmartScreen for Microsoft Store apps status was not reported.',
      evidence: `EnableWebContentEvaluation: ${formatValue(data.StoreAppsSmartScreen)}`,
      impact: 'This helps screen web content opened by Microsoft Store apps.',
      recommendation: storeSmartScreen ? 'No action required.' : 'Enable SmartScreen for Microsoft Store apps in Windows Security.',
      rawOutput: query.stdout
    }));

    return results;
  }

  private async buildCoreIsolationChecks(): Promise<DiagnosticResult[]> {
    const script = `
      function Read-Value($Path, $Name) {
        try {
          $item = Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop
          return $item.$Name
        } catch {
          return $null
        }
      }
      $deviceGuard = $null
      try {
        $deviceGuard = Get-CimInstance -Namespace root\\Microsoft\\Windows\\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction Stop |
          Select-Object SecurityServicesConfigured, SecurityServicesRunning, VirtualizationBasedSecurityStatus, RequiredSecurityProperties, AvailableSecurityProperties
      } catch {}
      $tpm = $null
      try {
        $tpm = Get-Tpm -ErrorAction Stop | Select-Object TpmPresent, TpmReady, TpmEnabled, TpmActivated
      } catch {}
      [ordered]@{
        MemoryIntegrity = Read-Value 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' 'Enabled'
        KernelShadowStacks = Read-Value 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\KernelShadowStacks' 'Enabled'
        LsaRunAsPpl = Read-Value 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' 'RunAsPPL'
        LsaRunAsPplBoot = Read-Value 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' 'RunAsPPLBoot'
        VulnerableDriverBlocklist = Read-Value 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\CI\\Config' 'VulnerableDriverBlocklistEnable'
        DeviceGuard = $deviceGuard
        Tpm = $tpm
      } | ConvertTo-Json -Depth 6
    `;
    const query = await this.runPowerShell(script);
    const data = parseJson<JsonRecord>(query.stdout);

    if (!data) {
      return [this.createErrorResult('core-isolation', 'Core Isolation', 'Core Isolation Status', { message: 'Could not query core isolation settings.' })];
    }

    const results: DiagnosticResult[] = [];
    const memoryIntegrity = asNumber(data.MemoryIntegrity);
    results.push(this.createNullableBooleanResult({
      id: 'core-memory-integrity',
      category: 'Core Isolation',
      label: 'Memory Integrity',
      value: memoryIntegrity === undefined || memoryIntegrity === null ? null : memoryIntegrity === 1,
      enabledDetails: 'Memory integrity is enabled.',
      disabledDetails: 'Memory integrity is disabled.',
      unknownDetails: 'Memory integrity status was not reported.',
      evidence: `HypervisorEnforcedCodeIntegrity Enabled: ${formatValue(data.MemoryIntegrity)}`,
      impact: 'Memory integrity uses virtualization-based security to protect kernel-mode code integrity.',
      recommendation: memoryIntegrity === 1 ? 'No action required.' : 'Enable Memory integrity if drivers and hardware support it.',
      rawOutput: query.stdout
    }));

    const kernelStacks = asNumber(data.KernelShadowStacks);
    results.push(this.createNullableBooleanResult({
      id: 'core-kernel-stack-protection',
      category: 'Core Isolation',
      label: 'Kernel-Mode Hardware-Enforced Stack Protection',
      value: kernelStacks === undefined || kernelStacks === null ? null : kernelStacks === 1,
      enabledDetails: 'Kernel-mode hardware-enforced stack protection is enabled.',
      disabledDetails: 'Kernel-mode hardware-enforced stack protection is disabled.',
      unknownDetails: 'Kernel-mode hardware-enforced stack protection is not exposed on this system.',
      evidence: `KernelShadowStacks Enabled: ${formatValue(data.KernelShadowStacks)}`,
      impact: 'Stack protection helps defend kernel execution flow from memory corruption attacks.',
      recommendation: kernelStacks === 1 ? 'No action required.' : 'Review Core isolation settings if this hardware supports the feature.',
      rawOutput: query.stdout
    }));

    const deviceGuard = asRecord(data.DeviceGuard);
    const runningServices = toNumberArray(deviceGuard?.SecurityServicesRunning);
    const configuredServices = toNumberArray(deviceGuard?.SecurityServicesConfigured);
    const firmwareProtectionRunning = runningServices.includes(3) || runningServices.includes(4);
    const firmwareProtectionConfigured = configuredServices.includes(3) || configuredServices.includes(4);
    results.push(this.createNullableBooleanResult({
      id: 'core-firmware-memory-access-protection',
      category: 'Core Isolation',
      label: 'Firmware / Memory Access Protection',
      value: deviceGuard ? firmwareProtectionRunning || firmwareProtectionConfigured : null,
      enabledDetails: firmwareProtectionRunning ? 'Firmware or memory access protection is running.' : 'Firmware or memory access protection is configured.',
      disabledDetails: 'Firmware or memory access protection is not configured.',
      unknownDetails: 'Device Guard did not report firmware or memory access protection status.',
      evidence: `SecurityServicesRunning: ${formatValue(runningServices)}, SecurityServicesConfigured: ${formatValue(configuredServices)}, VBS Status: ${formatValue(deviceGuard?.VirtualizationBasedSecurityStatus)}`,
      impact: 'Firmware and memory access protections reduce DMA and low-level firmware attack surface on supported hardware.',
      recommendation: firmwareProtectionRunning || firmwareProtectionConfigured ? 'No action required.' : 'Review Windows Security device security settings for supported protections.',
      rawOutput: query.stdout,
      autoRepair: firmwareProtectionRunning || firmwareProtectionConfigured ? undefined : { type: 'restart-firmware' }
    }));

    const lsaValue = asNumber(data.LsaRunAsPpl);
    const lsaBootValue = asNumber(data.LsaRunAsPplBoot);
    const lsaProtected = lsaValue === 1 || lsaValue === 2 || lsaBootValue === 1 || lsaBootValue === 2;
    results.push(this.createNullableBooleanResult({
      id: 'core-lsa-protection',
      category: 'Core Isolation',
      label: 'Local Security Authority Protection',
      value: data.LsaRunAsPpl === undefined && data.LsaRunAsPplBoot === undefined ? null : lsaProtected,
      enabledDetails: 'Local Security Authority protection is enabled.',
      disabledDetails: 'Local Security Authority protection is disabled.',
      unknownDetails: 'Local Security Authority protection status was not reported.',
      evidence: `RunAsPPL: ${formatValue(data.LsaRunAsPpl)}, RunAsPPLBoot: ${formatValue(data.LsaRunAsPplBoot)}`,
      impact: 'LSA protection helps prevent credential theft from the LSASS process.',
      recommendation: lsaProtected ? 'No action required.' : 'Enable Local Security Authority protection in Windows Security.',
      rawOutput: query.stdout
    }));

    const driverBlocklist = asNumber(data.VulnerableDriverBlocklist);
    results.push(this.createNullableBooleanResult({
      id: 'core-vulnerable-driver-blocklist',
      category: 'Core Isolation',
      label: 'Microsoft Vulnerable Driver Blocklist',
      value: driverBlocklist === undefined || driverBlocklist === null ? null : driverBlocklist === 1,
      enabledDetails: 'Microsoft vulnerable driver blocklist is enabled.',
      disabledDetails: 'Microsoft vulnerable driver blocklist is disabled.',
      unknownDetails: 'Microsoft vulnerable driver blocklist status was not reported.',
      evidence: `VulnerableDriverBlocklistEnable: ${formatValue(data.VulnerableDriverBlocklist)}`,
      impact: 'The blocklist helps prevent known vulnerable kernel drivers from loading.',
      recommendation: driverBlocklist === 1 ? 'No action required.' : 'Enable the vulnerable driver blocklist in Windows Security when available.',
      rawOutput: query.stdout
    }));

    const tpm = asRecord(data.Tpm);
    const tpmReady = asBoolean(tpm?.TpmPresent) === true && asBoolean(tpm?.TpmReady) === true;
    results.push(this.createNullableBooleanResult({
      id: 'system-tpm',
      category: 'Core Isolation',
      label: 'TPM Readiness',
      value: tpm ? tpmReady : null,
      enabledDetails: 'TPM is present and ready.',
      disabledDetails: 'TPM is missing, disabled, or not ready.',
      unknownDetails: 'TPM status was not reported.',
      evidence: `TpmPresent: ${formatValue(tpm?.TpmPresent)}, TpmReady: ${formatValue(tpm?.TpmReady)}, TpmEnabled: ${formatValue(tpm?.TpmEnabled)}, TpmActivated: ${formatValue(tpm?.TpmActivated)}`,
      impact: 'TPM readiness supports device security, credential protection, and Windows 11 security baselines.',
      recommendation: tpmReady ? 'No action required.' : 'Enable or initialize TPM in firmware if this hardware supports it.',
      rawOutput: query.stdout,
      autoRepair: tpmReady ? undefined : { type: 'restart-firmware' }
    }));

    return results;
  }

  private async buildUacAndServiceChecks(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    try {
      const uac = await this.readRegistry('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'EnableLUA');
      const isUacEnabled = uac === '1';
      results.push(this.createResult(
        'uac',
        'Security Controls',
        'User Account Control',
        isUacEnabled ? 'passed' : 'warning',
        isUacEnabled ? 'User Account Control is enabled.' : 'User Account Control is disabled.',
        `EnableLUA: ${formatValue(uac)}`,
        isUacEnabled ? 'Administrative actions are prompted.' : 'Higher risk of unauthorized system changes.',
        isUacEnabled ? 'No action required.' : 'Enable UAC for better security.',
        isUacEnabled ? 'low' : 'medium',
        `Registry EnableLUA: ${formatValue(uac)}`,
        { type: 'uac' }
      ));
    } catch (error) {
      results.push(this.createErrorResult('uac', 'Security Controls', 'User Account Control', error));
    }

    const updateService = await this.runPowerShell("Get-Service -Name wuauserv -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType | ConvertTo-Json -Depth 3");
    const service = parseJson<JsonRecord>(updateService.stdout);
    const updateHealthy = service && String(service.Status).toLowerCase() !== 'disabled' && String(service.StartType).toLowerCase() !== 'disabled';
    results.push(this.createNullableBooleanResult({
      id: 'windows-update-service',
      category: 'Security Controls',
      label: 'Windows Update Service',
      value: service ? Boolean(updateHealthy) : null,
      enabledDetails: 'Windows Update service is available.',
      disabledDetails: 'Windows Update service appears disabled.',
      unknownDetails: 'Windows Update service status was not reported.',
      evidence: `Status: ${formatValue(service?.Status)}, StartType: ${formatValue(service?.StartType)}`,
      impact: 'Windows Update delivers security fixes, Defender platform updates, and driver compatibility updates.',
      recommendation: updateHealthy ? 'No action required.' : 'Enable Windows Update or review local update policy.',
      rawOutput: updateService.stdout
    }));

    return results;
  }

  private async getJsonRecord(command: string): Promise<JsonRecord | null> {
    const result = await this.runPowerShell(command, 15000);
    return parseJson<JsonRecord>(result.stdout);
  }

  private createBooleanResult(options: {
    id: string;
    category: string;
    label: string;
    value: boolean | null;
    enabledDetails: string;
    disabledDetails: string;
    evidence: string;
    impact: string;
    recommendation: string;
    disabledStatus?: 'warning' | 'critical';
    rawOutput?: string;
    autoRepair?: unknown;
  }): DiagnosticResult {
    return this.createNullableBooleanResult({
      ...options,
      value: options.value,
      unknownDetails: `${options.label} status was not reported.`
    });
  }

  private createNullableBooleanResult(options: {
    id: string;
    category: string;
    label: string;
    value: boolean | null;
    enabledDetails: string;
    disabledDetails: string;
    unknownDetails: string;
    evidence: string;
    impact: string;
    recommendation: string;
    disabledStatus?: 'warning' | 'critical';
    rawOutput?: string;
    autoRepair?: unknown;
  }): DiagnosticResult {
    const unknown = options.value === null;
    const enabled = options.value === true;
    const status = enabled ? 'passed' : unknown ? 'warning' : options.disabledStatus ?? 'warning';
    return this.createResult(
      options.id,
      options.category,
      options.label,
      status,
      enabled ? options.enabledDetails : unknown ? options.unknownDetails : options.disabledDetails,
      options.evidence,
      options.impact,
      options.recommendation,
      enabled ? 'low' : status === 'critical' ? 'critical' : 'medium',
      options.rawOutput,
      options.autoRepair
    );
  }

  private createNumericStateResult(options: {
    id: string;
    category: string;
    label: string;
    value: number | null;
    enabledWhen: (value: number) => boolean;
    enabledDetails: string;
    disabledDetails: string;
    evidence: string;
    impact: string;
    recommendation: string;
    rawOutput?: string;
    autoRepair?: unknown;
  }): DiagnosticResult {
    const valueKnown = typeof options.value === 'number';
    const enabled = valueKnown ? options.enabledWhen(options.value!) : null;
    return this.createNullableBooleanResult({
      id: options.id,
      category: options.category,
      label: options.label,
      value: enabled,
      enabledDetails: options.enabledDetails,
      disabledDetails: options.disabledDetails,
      unknownDetails: `${options.label} status was not reported.`,
      evidence: options.evidence,
      impact: options.impact,
      recommendation: options.recommendation,
      rawOutput: options.rawOutput,
      autoRepair: options.autoRepair
    });
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

function getFirstDefined(source: JsonRecord | null, keys: string[]): unknown {
  if (!source) return undefined;
  return keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);
}

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(asNumber).filter((item): item is number => typeof item === 'number');
  }
  const single = asNumber(value);
  return typeof single === 'number' ? [single] : [];
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'not reported';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
