import fs from 'node:fs';
import path from 'node:path';

/** Public assessment page. This is a marketing page, not the trading terminal. */
export const DEFAULT_BASE_URL = 'https://www.aquariux.com/solutions/trader/';

export const EXECUTION_DISABLED_REASON =
  'BLOCKED_EXECUTION_DISABLED: Set ENABLE_DEMO_TRADING=true and DEMO_ACCOUNT_CONFIRMED=true only for a confirmed demo or test account. No order was submitted.';

const SECRET_NAME = /PASSWORD|SECRET|TOKEN|COOKIE|API[_-]?KEY|SESSION/i;

let envFileLoaded = false;

export function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return undefined;
  }

  const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
  const separator = withoutExport.indexOf('=');
  if (separator <= 0) {
    return undefined;
  }

  const key = withoutExport.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return undefined;
  }

  let value = withoutExport.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

/**
 * Loads `.env` from the project root when a variable is not already set.
 * Existing shell and CI variables win. Secret values are never written to logs.
 */
export function loadLocalEnv(file = path.resolve(process.cwd(), '.env')): void {
  if (envFileLoaded) {
    return;
  }
  envFileLoaded = true;

  if (!fs.existsSync(file)) {
    return;
  }

  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(rawLine);
    if (!parsed) {
      continue;
    }
    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

export function isSecretEnvName(name: string): boolean {
  return SECRET_NAME.test(name);
}

export function redactEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    return '<unset>';
  }
  if (isSecretEnvName(name)) {
    return '<redacted>';
  }
  return value;
}

export function isDemoExecutionAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_DEMO_TRADING === 'true' && env.DEMO_ACCOUNT_CONFIRMED === 'true';
}

export function assertDemoExecutionAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (!isDemoExecutionAllowed(env)) {
    throw new Error(
      'Refusing to perform a trading action. Set ENABLE_DEMO_TRADING=true and DEMO_ACCOUNT_CONFIRMED=true only after you have confirmed a demo or test account. No order was submitted.',
    );
  }
}

export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const candidate = env.BASE_URL?.trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`BASE_URL must be an absolute http(s) URL. Received: ${redactEnv('BASE_URL', candidate)}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('BASE_URL must use the http or https protocol.');
  }

  return url.toString();
}

/** Drops query strings and fragments so report annotations do not keep session tokens. */
export function safePageUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '<unparsed-url>';
  }
}

loadLocalEnv();
