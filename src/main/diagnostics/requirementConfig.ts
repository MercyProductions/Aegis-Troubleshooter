import fs from 'fs';
import path from 'path';
import { DiagnosticResult, DiagnosticStatus, ScanContext, Severity } from './types';

type RequirementRule = {
  id?: string;
  checkId: string;
  label?: string;
  allowedStatuses?: DiagnosticStatus[];
  requiredStatus?: DiagnosticStatus;
  severity?: Severity;
  impact?: string;
  recommendation?: string;
};

type RequirementProfile = {
  id: string;
  name: string;
  description?: string;
  sourcePath: string;
  requirements: RequirementRule[];
};

type RequirementConfigFile = {
  schemaVersion?: number;
  id?: string;
  name?: string;
  appName?: string;
  description?: string;
  requirements?: RequirementRule[];
  profiles?: Array<{
    id?: string;
    name?: string;
    description?: string;
    requirements?: RequirementRule[];
  }>;
  plugins?: Array<{
    id?: string;
    name?: string;
    description?: string;
    requirements?: RequirementRule[];
  }>;
};

type LoadedRequirementConfig = {
  profiles: RequirementProfile[];
  errors: DiagnosticResult[];
};

const CONFIG_FILE_NAMES = [
  'aegis-troubleshooter.config.json',
  '.aegis-troubleshooter.json'
];

const PLUGIN_DIRECTORIES = [
  'troubleshooter-plugins',
  'plugins'
];

export function evaluateRequirementConfigs(context: ScanContext, detectedResults: DiagnosticResult[]): DiagnosticResult[] {
  const loaded = loadRequirementProfiles(context);
  const resultsById = new Map(detectedResults.map((result) => [result.id, result]));
  const requirementResults = loaded.profiles.flatMap((profile) => evaluateProfile(profile, resultsById));
  return [...loaded.errors, ...requirementResults];
}

function loadRequirementProfiles(context: ScanContext): LoadedRequirementConfig {
  const files = discoverConfigFiles(context);
  const profiles: RequirementProfile[] = [];
  const errors: DiagnosticResult[] = [];

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(raw) as RequirementConfigFile;
      profiles.push(...normalizeConfig(filePath, config));
    } catch (error) {
      errors.push(createRequirementResult({
        id: `requirements-config-error-${sanitizeId(path.basename(filePath))}`,
        label: `Requirement Config Error: ${path.basename(filePath)}`,
        status: 'warning',
        details: 'A requirement config could not be loaded.',
        evidence: error instanceof Error ? error.message : String(error),
        impact: 'Developer-specific requirement checks from this config were skipped.',
        recommendation: 'Fix the JSON syntax or remove the invalid config file.',
        severity: 'medium',
        rawOutput: filePath
      }));
    }
  }

  return { profiles, errors };
}

function discoverConfigFiles(context: ScanContext): string[] {
  const files = new Set<string>();
  const directories = new Set<string>();

  directories.add(process.cwd());

  if (context.appPath) {
    const appDirectory = path.dirname(context.appPath);
    directories.add(appDirectory);
    files.add(path.join(appDirectory, `${path.basename(context.appPath, path.extname(context.appPath))}.aegis-troubleshooter.json`));
  }

  const appData = process.env.APPDATA;
  if (appData) {
    directories.add(path.join(appData, 'Aegis', 'Troubleshooter'));
  }

  for (const directory of directories) {
    for (const fileName of CONFIG_FILE_NAMES) {
      files.add(path.join(directory, fileName));
    }

    for (const pluginDirectory of PLUGIN_DIRECTORIES) {
      const fullPluginDirectory = path.join(directory, pluginDirectory);
      if (!fs.existsSync(fullPluginDirectory)) continue;

      for (const entry of fs.readdirSync(fullPluginDirectory, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith('.json')) continue;
        if (entry.name.toLowerCase().includes('.example.')) continue;
        files.add(path.join(fullPluginDirectory, entry.name));
      }
    }
  }

  return Array.from(files).filter((filePath) => fs.existsSync(filePath));
}

function normalizeConfig(filePath: string, config: RequirementConfigFile): RequirementProfile[] {
  const profiles = [
    ...(config.profiles ?? []),
    ...(config.plugins ?? [])
  ];

  if (profiles.length > 0) {
    return profiles
      .filter((profile) => Array.isArray(profile.requirements) && profile.requirements.length > 0)
      .map((profile, index) => ({
        id: sanitizeId(profile.id || profile.name || `${path.basename(filePath)}-${index + 1}`),
        name: profile.name || config.name || config.appName || path.basename(filePath),
        description: profile.description || config.description,
        sourcePath: filePath,
        requirements: profile.requirements || []
      }));
  }

  if (!Array.isArray(config.requirements) || config.requirements.length === 0) {
    return [];
  }

  return [{
    id: sanitizeId(config.id || config.name || config.appName || path.basename(filePath)),
    name: config.name || config.appName || path.basename(filePath),
    description: config.description,
    sourcePath: filePath,
    requirements: config.requirements
  }];
}

function evaluateProfile(profile: RequirementProfile, resultsById: Map<string, DiagnosticResult>): DiagnosticResult[] {
  return profile.requirements
    .filter((requirement) => Boolean(requirement.checkId))
    .map((requirement) => {
      const source = resultsById.get(requirement.checkId);
      const allowedStatuses = requirement.allowedStatuses?.length
        ? requirement.allowedStatuses
        : [requirement.requiredStatus ?? 'passed'];
      const passed = Boolean(source && allowedStatuses.includes(source.status));
      const status = passed ? 'passed' : severityToStatus(requirement.severity ?? 'critical');
      const label = requirement.label || source?.label || requirement.checkId;
      const expected = allowedStatuses.join(', ');
      const detected = source ? source.status : 'missing';

      return createRequirementResult({
        id: `requirement-${profile.id}-${sanitizeId(requirement.id || requirement.checkId)}`,
        label: `${profile.name}: ${label}`,
        status,
        details: passed
          ? `Requirement satisfied. ${label} reported ${detected}.`
          : `Requirement not satisfied. Expected ${expected}, detected ${detected}.`,
        evidence: source
          ? `Source check: ${source.id}\nSource label: ${source.label}\nExpected status: ${expected}\nDetected status: ${source.status}\nSource evidence: ${source.evidence}`
          : `Source check ${requirement.checkId} was not detected. Expected status: ${expected}.`,
        impact: requirement.impact || profile.description || 'This is an application-specific requirement from a developer config.',
        recommendation: passed
          ? 'No action required.'
          : requirement.recommendation || source?.recommendation || 'Adjust the system setting or update the requirement config.',
        severity: passed ? 'low' : requirement.severity ?? 'critical',
        rawOutput: JSON.stringify({ profile, requirement, source }, null, 2)
      });
    });
}

function createRequirementResult(options: {
  id: string;
  label: string;
  status: DiagnosticStatus;
  details: string;
  evidence: string;
  impact: string;
  recommendation: string;
  severity: Severity;
  rawOutput?: string;
}): DiagnosticResult {
  return {
    id: options.id,
    category: 'Developer Requirements',
    label: options.label,
    status: options.status,
    details: options.details,
    evidence: options.evidence,
    impact: options.impact,
    recommendation: options.recommendation,
    severity: options.severity,
    rawOutput: options.rawOutput,
    timestamp: new Date().toISOString()
  };
}

function severityToStatus(severity: Severity): DiagnosticStatus {
  if (severity === 'critical' || severity === 'high') return 'critical';
  return 'warning';
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'requirement';
}
