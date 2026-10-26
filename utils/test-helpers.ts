import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

import { login } from '../pages/LoginPage';
import { EXECUTION_DISABLED_REASON, isDemoExecutionAllowed, safePageUrl } from './env';
import type { OrderPanel } from '../pages/OrderPanel';
import type { TradingTerminalPage } from '../pages/TradingTerminalPage';

export const ORDER_TYPE_NAMES = ['Market', 'Limit', 'Stop', 'Stop Limit'] as const;
export type OrderTypeName = (typeof ORDER_TYPE_NAMES)[number];

export interface OrdersFile {
  purpose: string;
  instrument: {
    value: null | string;
    note: string;
  };
  market: {
    volume: string;
    stopLossDistance: string;
    takeProfitDistance: string;
  };
  pending: {
    limit: { volume: string; priceDistance: string };
    stop: { volume: string; priceDistance: string };
    stopLimit: { volume: string; stopDistance: string; limitDistance: string };
    expiry: { note: string; candidateLabels: string[] };
  };
  partialClose: { volume: string };
}

export function annotate(testInfo: TestInfo, type: string, description: string): void {
  testInfo.annotations.push({ type, description });
}

export async function visibleMatches(locator: Locator): Promise<Locator[]> {
  const matches: Locator[] = [];
  for (const item of await locator.all()) {
    if (await item.isVisible()) {
      matches.push(item);
    }
  }
  return matches;
}

export async function firstVisible(locator: Locator): Promise<Locator | undefined> {
  const matches = await visibleMatches(locator);
  return matches[0];
}

export async function expectVisibleText(page: Page, pattern: RegExp, description: string): Promise<void> {
  const match = await firstVisible(page.getByText(pattern));
  if (!match) {
    throw new Error(
      `TODO: confirm the visible label for ${description}. No trading action was performed.`,
    );
  }
  await expect(match).toBeVisible();
}

/**
 * Stops the test with a skip when a trading control is missing or ambiguous.
 * `test.skip(true)` throws, so callers do not continue into a click.
 */
export function skipNow(reason: string): never {
  test.skip(true, reason);
  throw new Error(reason);
}

export function skipUnlessSingleVisible(matches: Locator[], actionName: string): Locator {
  const only = matches[0];
  if (matches.length === 1 && only) {
    return only;
  }

  return skipNow(
    `BLOCKED_SELECTOR_UNCONFIRMED: ${actionName} matched ${matches.length} visible elements (expected 1). ` +
      'Confirm the selector in the live terminal. No trading action was performed.',
  );
}

export async function openReadOnlyTerminal(terminal: TradingTerminalPage): Promise<void> {
  annotate(test.info(), 'safety', 'read-only');
  const username = process.env.TRADING_USERNAME?.trim();
  const password = process.env.TRADING_PASSWORD?.trim();
  if (username && password) {
    await test.step('log in', () => login(terminal.page, { username, password }));
  } else {
    await terminal.goto();
  }
  const inspection = await terminal.inspect();
  annotate(test.info(), 'page', safePageUrl(terminal.page.url()));

  if (inspection.status !== 'ready') {
    test.skip(true, inspection.reason);
  }

  const status = await terminal.getMarketStatus();
  annotate(test.info(), 'market-status', status);
}

export async function prepareDemoExecution(
  terminal: TradingTerminalPage,
  orderPanel: OrderPanel,
): Promise<void> {
  annotate(test.info(), 'safety', 'execution-gated');

  if (!isDemoExecutionAllowed()) {
    test.skip(true, EXECUTION_DISABLED_REASON);
  }

  await terminal.goto();
  const inspection = await terminal.inspect();
  annotate(test.info(), 'page', safePageUrl(terminal.page.url()));
  if (inspection.status !== 'ready') {
    test.skip(true, inspection.reason);
  }

  const status = await terminal.getMarketStatus({ waitMs: 3_000 });
  annotate(test.info(), 'market-status', status);
  if (status === 'closed') {
    test.skip(
      true,
      'BLOCKED_MARKET_CLOSED: The terminal shows MARKET CLOSED. The test did not submit, modify, close, or delete an order.',
    );
  }
  if (status !== 'open') {
    test.skip(
      true,
      'BLOCKED_MARKET_STATUS_UNKNOWN: No confirmed open-session label was visible. Update the market-status locator before executing. No order was submitted.',
    );
  }

  if (test.info().config.workers !== 1) {
    test.skip(
      true,
      'BLOCKED_PARALLEL: Demo execution tests run only with one worker. Use npm run test:execution. No order was submitted.',
    );
  }

  const oneClick = await orderPanel.readOneClickTrading();
  annotate(test.info(), 'one-click', oneClick);
  if (oneClick !== 'off') {
    test.skip(
      true,
      oneClick === 'on'
        ? 'BLOCKED_ONE_CLICK_ON: One-click trading is already enabled. Automation leaves that setting unchanged and does not send orders while it is on.'
        : 'BLOCKED_ONE_CLICK_UNKNOWN: The one-click control was not found, so execution cannot prove it is off. No order was submitted.',
    );
  }
}

export function parseDecimal(value: string): number | undefined {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseDisplayedPrice(raw: string): number | undefined {
  const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Shifts a displayed price by a positive distance from test data. */
export function shiftPrice(price: number, distance: string, direction: 'up' | 'down'): string | undefined {
  const delta = parseDecimal(distance);
  if (delta === undefined || !Number.isFinite(price) || price <= 0) {
    return undefined;
  }

  const decimals = distance.includes('.') ? (distance.split('.')[1]?.length ?? 0) : 0;
  const factor = 10 ** decimals;
  const priceScaled = Math.round(price * factor);
  const deltaScaled = Math.round(delta * factor);
  const nextScaled = direction === 'up' ? priceScaled + deltaScaled : priceScaled - deltaScaled;
  if (!Number.isFinite(nextScaled) || nextScaled <= 0) {
    return undefined;
  }

  return (nextScaled / factor).toFixed(decimals);
}

export async function findVisibleField(page: Page, patterns: readonly RegExp[]): Promise<Locator | undefined> {
  for (const pattern of patterns) {
    const candidates = [
      page.getByRole('spinbutton', { name: pattern }),
      page.getByRole('textbox', { name: pattern }),
      page.getByLabel(pattern),
      page.getByPlaceholder(pattern),
      page.getByRole('combobox', { name: pattern }),
    ];

    for (const candidate of candidates) {
      const match = await firstVisible(candidate);
      if (match) {
        return match;
      }
    }
  }

  return undefined;
}

export async function bodyRows(page: Page): Promise<Locator[]> {
  const rows: Locator[] = [];
  for (const row of await page.getByRole('row').all()) {
    if (!(await row.isVisible())) {
      continue;
    }
    if ((await row.getByRole('columnheader').count()) > 0) {
      continue;
    }
    const text = (await row.innerText()).trim();
    if (text.length === 0) {
      continue;
    }
    rows.push(row);
  }
  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDecimalField(value: unknown): value is string {
  return typeof value === 'string' && parseDecimal(value) !== undefined;
}

export function isOrdersFile(value: unknown): value is OrdersFile {
  if (!isRecord(value) || typeof value.purpose !== 'string' || !isRecord(value.instrument)) {
    return false;
  }
  if (!('value' in value.instrument) || value.instrument.value !== null || typeof value.instrument.note !== 'string') {
    return false;
  }
  if (!isRecord(value.market) || !isRecord(value.pending) || !isRecord(value.partialClose)) {
    return false;
  }

  const { market, pending, partialClose } = value;
  const limit = pending.limit;
  const stop = pending.stop;
  const stopLimit = pending.stopLimit;
  const expiry = pending.expiry;

  return (
    isDecimalField(market.volume) &&
    isDecimalField(market.stopLossDistance) &&
    isDecimalField(market.takeProfitDistance) &&
    isRecord(limit) &&
    isDecimalField(limit.volume) &&
    isDecimalField(limit.priceDistance) &&
    isRecord(stop) &&
    isDecimalField(stop.volume) &&
    isDecimalField(stop.priceDistance) &&
    isRecord(stopLimit) &&
    isDecimalField(stopLimit.volume) &&
    isDecimalField(stopLimit.stopDistance) &&
    isDecimalField(stopLimit.limitDistance) &&
    isRecord(expiry) &&
    typeof expiry.note === 'string' &&
    Array.isArray(expiry.candidateLabels) &&
    expiry.candidateLabels.every((label) => typeof label === 'string') &&
    isDecimalField(partialClose.volume)
  );
}

export function loadOrders(cwd = process.cwd()): OrdersFile {
  const file = path.join(cwd, 'test-data', 'orders.json');
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!isOrdersFile(parsed)) {
    throw new Error('test-data/orders.json does not match the expected demo-order shape.');
  }
  return parsed;
}

export async function alertText(page: Page): Promise<string[]> {
  return page.getByRole('alert').allTextContents();
}

/**
 * The application success UI has not been identified. Reaching this function fails the test.
 * A changed alert is not treated as a passed trade.
 */
export async function rejectUnconfirmedExecutionResult(page: Page): Promise<never> {
  const observed = (await alertText(page))
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join(' | ');
  throw new Error(
    `RESULT_UI_UNCONFIRMED: No post-trade confirmation from the application is verified. Observed alerts: ${observed || '<none>'}. This failure is not a pass. If a submit step already ran, check the demo account before retrying.`,
  );
}

