import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://www.aquariux.com/solutions/trader/';
const SECRET_NAME = /PASSWORD|SECRET|TOKEN|COOKIE|API[_-]?KEY|SESSION/i;

const requiredFiles = [
  'package.json',
  'package-lock.json',
  'playwright.config.ts',
  'tsconfig.json',
  'README.md',
  'scripts/check-environment.mjs',
  'utils/env.ts',
  'utils/test-helpers.ts',
  'pages/TradingTerminalPage.ts',
  'pages/OrderPanel.ts',
  'fixtures/test-fixtures.ts',
  'tests/smoke/trading-terminal.spec.ts',
  'test-data/orders.json',
  'tests/market-orders.spec.ts',
  'tests/pending-orders.spec.ts',
  'tests/positions.spec.ts',
  'tests/order-history.spec.ts',
  'tests/bulk-actions.spec.ts',
  'tests/configuration-validation.spec.ts',
];

function parseEnvLine(line) {
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
  let value = withoutExport.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) {
    return false;
  }
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed || process.env[parsed.key] !== undefined) {
      continue;
    }
    process.env[parsed.key] = parsed.value;
  }
  return true;
}

function displayValue(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return '<unset>';
  }
  if (SECRET_NAME.test(name)) {
    return '<redacted>';
  }
  return value;
}

const root = process.cwd();
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
const nodeMajor = Number(process.versions.node.split('.')[0]);

console.log(`Node.js ${process.versions.node}`);
console.log(`Project ${root}`);

if (missing.length > 0) {
  console.error('Missing project files:');
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
  console.error('Node.js 20 or newer is required.');
  process.exit(1);
}

const envLoaded = loadEnvFile(path.join(root, '.env'));
console.log(`.env ${envLoaded ? 'found and loaded for empty variables' : 'not present'}`);

const baseUrl = process.env.BASE_URL?.trim() || DEFAULT_BASE_URL;
try {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('protocol');
  }
  console.log(`BASE_URL ${parsed.origin}${parsed.pathname}`);
  if (parsed.pathname.includes('/solutions/trader')) {
    console.log('Notice: BASE_URL still points at the public marketing page. Set it to the trading terminal before expecting terminal checks to run.');
  }
} catch {
  console.error('BASE_URL must be an absolute http(s) URL.');
  process.exit(1);
}

const demoTrading = process.env.ENABLE_DEMO_TRADING === 'true';
const demoConfirmed = process.env.DEMO_ACCOUNT_CONFIRMED === 'true';
console.log(`ENABLE_DEMO_TRADING ${displayValue('ENABLE_DEMO_TRADING')}`);
console.log(`DEMO_ACCOUNT_CONFIRMED ${displayValue('DEMO_ACCOUNT_CONFIRMED')}`);
console.log(`TRADING_USERNAME ${process.env.TRADING_USERNAME?.trim() ? '<set>' : '<unset>'}`);
console.log(`TRADING_PASSWORD ${displayValue('TRADING_PASSWORD')}`);
console.log(`STORAGE_STATE ${displayValue('STORAGE_STATE')}`);
console.log(`Demo execution ${demoTrading && demoConfirmed ? 'ENABLED' : 'disabled'}`);

if (demoTrading !== demoConfirmed) {
  console.log('Notice: demo execution stays disabled until both flags are the exact string true.');
}

if (process.env.STORAGE_STATE?.trim() && !fs.existsSync(process.env.STORAGE_STATE.trim())) {
  console.error('STORAGE_STATE points at a file that does not exist.');
  process.exit(1);
}

const playwrightPackage = path.join(root, 'node_modules', '@playwright', 'test');
console.log(`@playwright/test ${fs.existsSync(playwrightPackage) ? 'installed' : 'not installed — run npm ci'}`);
console.log('Environment check finished.');
