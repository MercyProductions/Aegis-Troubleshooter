export interface FixStep {
  title: string;
  description: string;
  action?: string;
}

export interface FixGuide {
  issueCode: string;
  title: string;
  plainEnglishSummary: string;
  whyItMatters: string;
  recommendedFixes: FixStep[];
  officialLinks: string[];
  riskLevel: 'safe' | 'moderate' | 'advanced';
  requiresAdmin: boolean;
  estimatedTime: string;
}

export const fixGuides: Record<string, FixGuide> = {
  'vcpp': {
    issueCode: 'VCPP_MISSING',
    title: 'Visual C++ Runtime Missing',
    plainEnglishSummary: 'Your computer is missing a set of files that many programs need to run.',
    whyItMatters: 'Without these runtimes, the application cannot load its core logic and will crash with an "0xc000007b" error.',
    recommendedFixes: [
      { title: 'Download Official Installer', description: 'Download the VC++ 2015-2022 Redistributable from Microsoft.' },
      { title: 'Install x64 Version', description: 'Run the installer and follow the prompts to complete the setup.' },
      { title: 'Restart Application', description: 'Close and reopen the troubleshooter to verify the fix.' }
    ],
    officialLinks: ['https://aka.ms/vs/17/release/vc_redist.x64.exe'],
    riskLevel: 'safe',
    requiresAdmin: true,
    estimatedTime: '2-3 minutes'
  },
  'defender': {
    issueCode: 'DEFENDER_BLOCK',
    title: 'Windows Defender Interference',
    plainEnglishSummary: 'Windows Security is actively monitoring or blocking the application.',
    whyItMatters: 'Security software often flags low-level tools as potential threats, preventing them from functioning.',
    recommendedFixes: [
      { title: 'Add Exclusion', description: 'Add the application folder to the Windows Defender exclusion list.' },
      { title: 'Temporarily Disable', description: 'Turn off Real-time protection while using the tool (not recommended for long periods).' }
    ],
    officialLinks: ['https://support.microsoft.com/en-us/windows/add-an-exclusion-to-windows-security-811816c0-4dfd-af4a-47e4-c301afe13b26'],
    riskLevel: 'moderate',
    requiresAdmin: true,
    estimatedTime: '1 minute'
  },
  'app-crashes': {
    issueCode: 'CRASH_DETECTED',
    title: 'Application Stability Issue',
    plainEnglishSummary: 'The system has recorded recent crashes for this specific application.',
    whyItMatters: 'Crashes indicate a conflict between the application and your system environment (drivers, runtimes, or permissions).',
    recommendedFixes: [
      { title: 'Check Exception Code', description: 'Look for codes like 0xc0000005 which often mean memory access violations.' },
      { title: 'Update GPU Drivers', description: 'Many crashes are caused by outdated graphics drivers.' }
    ],
    officialLinks: [],
    riskLevel: 'advanced',
    requiresAdmin: false,
    estimatedTime: 'Varies'
  },
  'protection': {
    issueCode: 'PROTECTION_INTERFERENCE',
    title: 'Protection Service Interference',
    plainEnglishSummary: 'A background protection service (like an anti-cheat or third-party antivirus) is active.',
    whyItMatters: 'These services are designed to block or monitor low-level system activity, which can interfere with legitimate troubleshooting and application logic.',
    recommendedFixes: [
      { title: 'Close Protected Games', description: 'Ensure all games using EAC, BattlEye, or Vanguard are closed.' },
      { title: 'Reboot System', description: 'A fresh reboot ensures all temporary protection drivers are unloaded.' },
      { title: 'Whitelist Application', description: 'Add the application to your antivirus exclusion list.' }
    ],
    officialLinks: [],
    riskLevel: 'safe',
    requiresAdmin: false,
    estimatedTime: '5 minutes'
  }
};
