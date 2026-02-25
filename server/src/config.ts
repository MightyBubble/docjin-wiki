import fs from 'fs';
import path from 'path';

function loadEnvFile(envFilePath: string): void {
  if (!fs.existsSync(envFilePath)) {
    return;
  }

  const raw = fs.readFileSync(envFilePath, 'utf-8');
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const SERVER_CWD = process.cwd();
loadEnvFile(path.resolve(SERVER_CWD, '.env'));

const defaultWorkspaceId =
  (process.env.DOCJIN_DEFAULT_WORKSPACE || 'default').trim() || 'default';

export const serverConfig = {
  port: parsePort(process.env.DOCJIN_SERVER_PORT ?? process.env.PORT, 3001),
  workspacesRoot: path.resolve(
    process.env.DOCJIN_WORKSPACES_ROOT || path.join(SERVER_CWD, 'workspaces')
  ),
  templateDataDir: path.resolve(
    process.env.DOCJIN_TEMPLATE_DATA_DIR || path.join(SERVER_CWD, 'data')
  ),
  defaultWorkspaceId,
  corsOrigins: parseCsv(process.env.DOCJIN_CORS_ORIGINS),
  enableRequestLogging: parseBoolean(process.env.DOCJIN_LOG_REQUESTS, false),
};

