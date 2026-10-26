import type { BrowserContext, Locator, Page } from '@playwright/test';

import { login } from '../pages/LoginPage';
import { EXECUTION_DISABLED_REASON, isDemoExecutionAllowed } from '../utils/env';
import { annotate, parseDisplayedPrice } from '../utils/test-helpers';
import { expect, test } from '../fixtures/test-fixtures';

const OPEN_POSITIONS_TAB = 'tab-asset-order-type-open-positions';

function openPositionCountPattern(count: number): RegExp {
  return new RegExp(`^Open Positions?\\s*\\(${count}\\)$`, 'i');
}

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isOpenPositionCount(text: string, count: number): boolean {
  return openPositionCountPattern(count).test(compactText(text));
}

function readOpenPositionCount(text: string): number | undefined {
  const match = compactText(text).match(/Open Positions?\s*\((\d+)\)/i);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

const PLACE_UNTIL_TIMEOUT_MS = 120_000;
const CASE_TIMEOUT_MS = 180_000;
const MARKET_PROTECTION_ATTEMPTS = 10;
const MARKET_PROTECTION_TIMEOUT_MS = 120_000;
const LIVE_PRICE_TICK_MS = 1_000;

test.describe('requirement scenarios', { tag: '@execution' }, () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext | undefined;
  let page: Page | undefined;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(CASE_TIMEOUT_MS);

    if (!isDemoExecutionAllowed()) {
      test.skip(true, EXECUTION_DISABLED_REASON);
    }

    const credentials = tradingCredentialsOrSkip();

    context = await browser.newContext();
    page = await context.newPage();
    await login(page, credentials);
    await expect(page.getByTestId('trade-dropdown-order-type')).toBeVisible();
  });

  test.afterAll(async () => {
    if (page && !page.isClosed()) {
      await bulkCloseAllPositions(page).catch(() => undefined);
    }
    await context?.close();
  });

  test('TC1 market order with stop loss and take profit until one open position', async () => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const session = requireSession(page);
    await turnOneClickOff(session);
    await ensureOpenPositionCount(session, 0);
    await placeMarketOrderWithProtections(session);
    await expectOpenPositionCount(openPositionsTab(session), 1);
    await bulkCloseAllPositions(session);
  });

  test('TC2 one-click buy until one open position', async () => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const session = requireSession(page);
    await ensureOneClickTrading(session, true);
    await ensureOpenPositionCount(session, 0);
    await page.getByTestId('trade-input-volume').click();
    await page.getByTestId('trade-input-volume-increase').click();
    await placeUntilOpenCount(session, 1, () => placeOneClickBuy(session));
    await expectOpenPositionCount(openPositionsTab(session), 1);
    await bulkCloseAllPositions(session);
  });

  test('TC3-TC4 two one-click positions, sort, close one, and edit the remaining order', async () => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const session = requireSession(page);
    await ensureOpenPositionCount(session, 0);
    await placeUntilOpenCount(session, 2, () => placeOneClickBuy(session));

    const rows = session.getByTestId('asset-open-list-item');
    await expect(rows).toHaveCount(2);
    const firstRowBefore = (await rows.nth(0).innerText()).trim();
    expect(firstRowBefore.length).toBeGreaterThan(0);

    await session.getByText('Order No.').click();
    await expect(rows.nth(0)).not.toHaveText(firstRowBefore);

    await rows.nth(0).getByTestId('asset-open-button-close').click();
    await confirmIfShown(session);
    await expectOpenPositionCount(openPositionsTab(session), 1);

    await session.getByTestId('asset-open-button-edit').click();
    await session.getByTestId('edit-button-order').click();
    await confirmIfShown(session);

    await bulkCloseAllPositions(session);
  });

  test('TC5 market order then one-click buy until two open positions, then bulk close all', async () => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const session = requireSession(page);
    await ensureOpenPositionCount(session, 0);
    await ensureOpenPositionCount(session, 0);
    await placeUntilOpenCount(session, 2, () => placeOneClickBuy(session));
    await bulkCloseAllPositions(session);
  });

  test('TC6-TC7 view notifications and history without a new login', async () => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const session = requireSession(page);
 
    await session.getByTestId('notification-selector').click();
    await session.waitForTimeout(5_000);
 
    await session.getByTestId('tab-asset-order-type-history-positions-history').click();
    await session.waitForTimeout(5_000);
 
    await session.getByTestId('tab-asset-order-type-history-orders-and-deals').click();
    await session.waitForTimeout(5_000);
 
    const expandButtons = session.locator('[data-testid="asset-history-position-list-item-expand"]:visible');
    await expandButtons.nth(2).scrollIntoViewIfNeeded();
 
    const fillPolicies: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const expand = expandButtons.nth(index);
      await expand.scrollIntoViewIfNeeded();
      await expand.click();
      const fillPolicyCell = session.locator('[data-testid="asset-history-column-fill-policy"]:visible').nth(index);
      await fillPolicyCell.scrollIntoViewIfNeeded();
      await expect(fillPolicyCell, `Fill policy on history row ${index + 1} was not visible.`).toBeVisible();
      const fillPolicy = (await fillPolicyCell.innerText()).trim();
      expect(fillPolicy.length, `Fill policy on history row ${index + 1} was empty.`).toBeGreaterThan(0);
      fillPolicies.push(fillPolicy);
      annotate(test.info(), `history-fill-policy-${index + 1}`, fillPolicy);
    }
 
    expect(fillPolicies).toHaveLength(3);
  });
});

function requireSession(session: Page | undefined): Page {
  if (!session || session.isClosed()) {
    throw new Error('The shared trading session was not started. Earlier setup did not complete.');
  }
  return session;
}

function tradingCredentialsOrSkip(): { username: string; password: string } {
  const username = process.env.TRADING_USERNAME?.trim();
  const password = process.env.TRADING_PASSWORD?.trim();
  if (!username || !password) {
    test.skip(
      true,
      'AUTH_REQUIRED: Set TRADING_USERNAME and TRADING_PASSWORD. The password is not printed.',
    );
  }
  if (!username || !password) {
    throw new Error('AUTH_REQUIRED: Trading credentials were not set. The password is not printed.');
  }
  return { username, password };
}

function openPositionsTab(page: Page): Locator {
  return page.getByTestId(OPEN_POSITIONS_TAB);
}


async function ensureOpenPositionCount(page: Page, count: number): Promise<void> {
  const tab = openPositionsTab(page);
  await tab.click();
  const current = compactText(await tab.innerText());
  if (!isOpenPositionCount(current, count) && count === 0) {
    await bulkCloseAllPositions(page);
  }
  await expectOpenPositionCount(tab, count);
}

async function placeUntilOpenCount(page: Page, count: number, place: () => Promise<void>): Promise<void> {
  const deadline = Date.now() + PLACE_UNTIL_TIMEOUT_MS;
  await openPositionsTab(page).click();

  while (Date.now() <= deadline) {
    const current = await displayedOpenCount(page);
    if (current !== undefined && current >= count) {
      return;
    }

    const before = current ?? 0;
    await place();
    const remaining = Math.max(1_000, deadline - Date.now());
    await expect
      .poll(async () => (await displayedOpenCount(page)) ?? before, {
        timeout: remaining,
        message: `The open-position count stayed at ${before} after one order. No further order was sent.`,
      })
      .toBeGreaterThan(before);
  }
}

async function displayedOpenCount(page: Page): Promise<number | undefined> {
  return readOpenPositionCount(await openPositionsTab(page).innerText());
}

async function placeMarketOrderWithProtections(page: Page): Promise<void> {
  const orderButton = page.getByTestId('trade-button-order');
  const positionsTab = openPositionsTab(page);
  const deadline = Date.now() + MARKET_PROTECTION_TIMEOUT_MS;
  await page.getByTestId('trade-input-volume').click();
  await page.getByTestId('trade-input-volume-increase').click();

  for (let attempt = 1; attempt <= MARKET_PROTECTION_ATTEMPTS; attempt += 1) {
    if (Date.now() > deadline) {
      break;
    }

    if (isOpenPositionCount(await positionsTab.innerText(), 1)) {
      return;
    }

    await adjustStopLossBelowLive(page);
    await adjustTakeProfitAboveLive(page);

    const live = await readLiveBuyPrice(page);
    const stopLoss = await readPriceInput(page, 'trade-input-stoploss-price');
    const takeProfit = await readPriceInput(page, 'trade-input-takeprofit-price');
    const orderEnabled = await orderButton.isEnabled().catch(() => false);

    if (stopLoss < live && takeProfit > live && orderEnabled) {
      await orderButton.click();
      await page.getByTestId('trade-confirmation-button-confirm').click();
    }

    if (isOpenPositionCount(await positionsTab.innerText(), 1)) {
      return;
    }

    await page.waitForTimeout(LIVE_PRICE_TICK_MS);
  }

  await expectOpenPositionCount(positionsTab, 1);
}

async function adjustStopLossBelowLive(page: Page): Promise<void> {
  const stopLossInput = page.getByTestId('trade-input-stoploss-price');
  const decrease = page.getByTestId('trade-input-stoploss-price-decrease');

  for (let click = 0; click < 20; click += 1) {
    const live = await readLiveBuyPrice(page);
    const stopLoss = await readPriceInput(page, 'trade-input-stoploss-price');
    if (Number.isFinite(stopLoss) && stopLoss < live) {
      return;
    }
    await stopLossInput.hover();
    await decrease.click();
  }
}

async function adjustTakeProfitAboveLive(page: Page): Promise<void> {
  const takeProfitInput = page.getByTestId('trade-input-takeprofit-price');
  const increase = page.getByTestId('trade-input-takeprofit-price-increase');

  for (let click = 0; click < 20; click += 1) {
    const live = await readLiveBuyPrice(page);
    const takeProfit = await readPriceInput(page, 'trade-input-takeprofit-price');
    if (Number.isFinite(takeProfit) && takeProfit > live) {
      return;
    }
    await takeProfitInput.hover();
    await increase.click();
  }
}

async function readLiveBuyPrice(page: Page): Promise<number> {
  const livePrice = page.getByTestId('trade-live-buy-price');
  await expect(livePrice).toBeVisible();
  return requirePrice((await livePrice.innerText()).trim(), 'trade-live-buy-price');
}

async function readPriceInput(page: Page, testId: string): Promise<number> {
  const raw = (await page.getByTestId(testId).getAttribute('value')) ?? '';
  return parseDisplayedPrice(raw) ?? Number.NaN;
}

function requirePrice(raw: string, testId: string): number {
  const parsed = parseDisplayedPrice(raw);
  if (parsed === undefined) {
    throw new Error(`Could not parse a price from data-testid="${testId}". Observed: ${raw || '<empty>'}.`);
  }
  return parsed;
}

async function placeOneClickBuy(page: Page): Promise<void> {
  await page.getByTestId('trade-button-oct-order-buy').click();
}

async function bulkCloseAllPositions(page: Page): Promise<void> {
  const tab = openPositionsTab(page);
  await tab.click();
  if (isOpenPositionCount(await tab.innerText(), 0)) {
    return;
  }

  await page.getByTestId('bulk-close').click();
  await page.getByText('All Positions', { exact: true }).click();
  await page.getByTestId('bulk-close-modal-button-submit-all').click();
  await confirmIfShown(page);
  await tab.click();

  if (!isOpenPositionCount(await tab.innerText(), 0)) {
    await closeEachOpenPosition(page);
  }
  await expectOpenPositionCount(tab, 0);
}

async function closeEachOpenPosition(page: Page): Promise<void> {
  const tab = openPositionsTab(page);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await tab.click();
    if (isOpenPositionCount(await tab.innerText(), 0)) {
      return;
    }
    const row = page.getByTestId('asset-open-list-item').first();
    await row.getByTestId('asset-open-button-close').click();
    await confirmIfShown(page);
  }
}

async function expectOpenPositionCount(tab: Locator, count: number): Promise<void> {
  await expect
    .poll(async () => compactText(await tab.innerText()), {
      timeout: 10_000,
      message: `Expected the open-positions tab to show Open Position (${count}) or Open Positions (${count}).`,
    })
    .toMatch(openPositionCountPattern(count));
}

async function confirmIfShown(page: Page): Promise<void> {
  const confirm = page.getByTestId('trade-confirmation-button-confirm');
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
  }
}

async function turnOneClickOff(page: Page): Promise<void> {
  await page.getByTestId('app-setting-dropdown-trigger').click();
  const checkedToggle = page.getByTestId('toggle-oct-checked');
  if (await checkedToggle.isVisible().catch(() => false)) {
    await checkedToggle.click();
  }
  await expect(page.getByTestId('toggle-oct')).toBeVisible();
  await page.keyboard.press('Escape');
}

async function ensureOneClickTrading(page: Page, enabled: boolean): Promise<void> {
  if (!enabled) {
    await turnOneClickOff(page);
    return;
  }

  await page.getByTestId('app-setting-dropdown-trigger').click();
  const toggle = page.getByTestId('toggle-oct');
  await expect(toggle).toBeVisible();

  if (!(await isToggleOn(toggle))) {
    await toggle.click();
    await page.getByText('Agree and continue', { exact: true }).click();
  }

  await page.keyboard.press('Escape');
}

async function isToggleOn(toggle: Locator): Promise<boolean> {
  if (await toggle.isChecked().catch(() => false)) {
    return true;
  }

  const ariaChecked = await toggle.getAttribute('aria-checked');
  if (ariaChecked === 'true') {
    return true;
  }

  const dataState = await toggle.getAttribute('data-state');
  return dataState === 'checked' || dataState === 'on';
}
