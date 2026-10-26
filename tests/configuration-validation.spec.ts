import fs from 'node:fs';
import path from 'node:path';

import {
  assertDemoExecutionAllowed,
  DEFAULT_BASE_URL,
  isDemoExecutionAllowed,
  isSecretEnvName,
  parseEnvLine,
  redactEnv,
  resolveBaseUrl,
} from '../utils/env';
import { isOrdersFile, shiftPrice } from '../utils/test-helpers';
import { expect, test } from '../fixtures/test-fixtures';

test('denies order execution unless both demo flags are exactly true', () => {
  expect(isDemoExecutionAllowed({})).toBe(false);
  expect(isDemoExecutionAllowed({ ENABLE_DEMO_TRADING: 'true' })).toBe(false);
  expect(isDemoExecutionAllowed({ DEMO_ACCOUNT_CONFIRMED: 'true' })).toBe(false);
  expect(isDemoExecutionAllowed({ ENABLE_DEMO_TRADING: 'TRUE', DEMO_ACCOUNT_CONFIRMED: 'true' })).toBe(false);
  expect(isDemoExecutionAllowed({ ENABLE_DEMO_TRADING: '1', DEMO_ACCOUNT_CONFIRMED: '1' })).toBe(false);
  expect(isDemoExecutionAllowed({ ENABLE_DEMO_TRADING: 'true', DEMO_ACCOUNT_CONFIRMED: 'true' })).toBe(true);

  expect(() => assertDemoExecutionAllowed({})).toThrow(/No order was submitted/);
  expect(() =>
    assertDemoExecutionAllowed({ ENABLE_DEMO_TRADING: 'true', DEMO_ACCOUNT_CONFIRMED: 'true' }),
  ).not.toThrow();
});

test('redacts passwords and similar secrets', () => {
  expect(isSecretEnvName('TRADING_PASSWORD')).toBe(true);
  expect(isSecretEnvName('BASE_URL')).toBe(false);
  expect(redactEnv('TRADING_PASSWORD', 'not-a-real-secret')).toBe('<redacted>');
  expect(redactEnv('SESSION_COOKIE', 'abc')).toBe('<redacted>');
  expect(redactEnv('BASE_URL', 'https://demo.example/terminal')).toBe('https://demo.example/terminal');
  expect(redactEnv('TRADING_PASSWORD', undefined)).toBe('<unset>');
});

test('parses env lines without keeping quoted wrapper characters', () => {
  expect(parseEnvLine('# comment')).toBeUndefined();
  expect(parseEnvLine('export BASE_URL="https://demo.example/terminal"')).toEqual({
    key: 'BASE_URL',
    value: 'https://demo.example/terminal',
  });
  expect(parseEnvLine('ENABLE_DEMO_TRADING=')).toEqual({ key: 'ENABLE_DEMO_TRADING', value: '' });
});

test('accepts only an absolute http(s) BASE_URL', () => {
  expect(DEFAULT_BASE_URL).toBe('https://www.aquariux.com/solutions/trader/');
  expect(resolveBaseUrl({ BASE_URL: 'https://demo.example/terminal' })).toBe('https://demo.example/terminal');
  expect(resolveBaseUrl({})).toBe(DEFAULT_BASE_URL);
  expect(() => resolveBaseUrl({ BASE_URL: 'not a url' })).toThrow(/http/);
  expect(() => resolveBaseUrl({ BASE_URL: 'ftp://files.example/terminal' })).toThrow(/http/);
});

test('shifts a displayed price by the configured distance', () => {
  expect(shiftPrice(1.25, '0.0010', 'up')).toBe('1.2510');
  expect(shiftPrice(1.25, '0.0010', 'down')).toBe('1.2490');
  expect(shiftPrice(0.0001, '0.0010', 'down')).toBeUndefined();
  expect(shiftPrice(1.25, '0', 'up')).toBeUndefined();
});

test('keeps demo order samples free of secrets', () => {
  const file = path.join(process.cwd(), 'test-data', 'orders.json');
  const raw = fs.readFileSync(file, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  expect(isOrdersFile(parsed)).toBe(true);
  expect(raw.toLowerCase()).not.toMatch(/password|api[_-]?key|cookie|secret|token/);
});

test('refuses trading actions before clicking when execution is not confirmed', async ({ page, orderPanel }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    requests.push(request.url());
  });

  const actions = [
    () => orderPanel.submitBuy(),
    () => orderPanel.submitSell(),
    () => orderPanel.modifyFirstPosition('0.01'),
    () => orderPanel.partialCloseFirstPosition('0.01'),
    () => orderPanel.fullCloseFirstPosition(),
    () => orderPanel.bulkClose(),
    () => orderPanel.bulkDeletePending(),
    () => orderPanel.deleteFirstPendingOrder(),
  ];

  for (const action of actions) {
    await expect(action()).rejects.toThrow(/Refusing to perform a trading action/);
  }

  expect(requests).toEqual([]);
});
