import type { BrowserContext, Locator, Page } from '@playwright/test';

import { login } from '../pages/LoginPage';
import { EXECUTION_DISABLED_REASON, isDemoExecutionAllowed } from '../utils/env';
import { annotate } from '../utils/test-helpers';
import { expect, test } from '../fixtures/test-fixtures';

const OPEN_POSITIONS_TAB = 'tab-asset-order-type-open-positions';
const OPEN_POSITIONS = (count: number) => `Open Positions (${count})`;
const PLACE_UNTIL_TIMEOUT_MS = 120_000;
const CASE_TIMEOUT_MS = 180_000;

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
    await selectXauusd(session);
    await ensureOneClickTrading(session, false);
    await ensureOpenPositionCount(session, 0);
    await placeUntilOpenCount(session, 1, () => placeMarketOrderWithProtections(session));
    await bulkCloseAllPositions(session);
  });

  test('TC2 one-click buy until one open position', async () => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const session = requireSession(page);
    await selectXauusd(session);
    await ensureOneClickTrading(session, true);
    await ensureOpenPositionCount(session, 0);
    await placeUntilOpenCount(session, 1, () => placeOneClickBuy(session));
    await bulkCloseAllPositions(session);
  });

  test('TC3-TC4 two one-click positions, sort, close one, and edit the remaining order', async () => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const session = requireSession(page);
    await selectXauusd(session);
    await ensureOneClickTrading(session, true);
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
    await expect(openPositionsTab(session)).toHaveText(OPEN_POSITIONS(1));

    await session.getByTestId('asset-open-button-edit').click();
    await session.getByTestId('edit-button-order').click();
    await confirmIfShown(session);

    await bulkCloseAllPositions(session);
  });

  test('TC5 market order then one-click buy until two open positions, then bulk close all', async () => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const session = requireSession(page);
    await selectXauusd(session);
    await ensureOneClickTrading(session, false);
    await ensureOpenPositionCount(session, 0);
    await placeUntilOpenCount(session, 1, () => placeMarketOrderWithProtections(session));

    await ensureOneClickTrading(session, true);
    await placeUntilOpenCount(session, 2, () => placeOneClickBuy(session));

    await session.getByTestId('bulk-close').click();
    await session.getByText('All Positions', { exact: true }).click();
    await session.getByTestId('bulk-close-modal-button-submit-all').click();
    await expect(openPositionsTab(session)).toHaveText(OPEN_POSITIONS(0));
  });

  test('TC6-TC7 view notifications and history without a new login', async () => {
    test.setTimeout(CASE_TIMEOUT_MS);
    const session = requireSession(page);

    await session.getByTestId('notification-selector').click();
    await session.waitForTimeout(5_000);

    await session.getByTestId('tab-asset-order-type-history-positions-history').click();
    await session.waitForTimeout(5_000);

    await session.getByTestId('tab-asset-order-type-history-orders-and-deals').click();

    const historyRows = session.getByTestId('asset-history-position-list-item');
    if ((await historyRows.count()) === 0) {
      await session.getByTestId('tab-asset-order-type-history-positions-history').click();
    }

    await expect(historyRows.first()).toBeVisible();

    const fillPolicies: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const row = historyRows.nth(index);
      await expect(row, `History row ${index + 1} was not visible.`).toBeVisible();
      await row.getByTestId('asset-history-position-list-item-expand').click();
      const fillPolicy = (await row.getByTestId('asset-history-column-fill-policy').innerText()).trim();
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

async function selectXauusd(page: Page): Promise<void> {
  await page.getByText('XAUUSD', { exact: true }).first().click();
}

async function ensureOpenPositionCount(page: Page, count: number): Promise<void> {
  const tab = openPositionsTab(page);
  await tab.click();
  const current = (await tab.innerText()).trim();
  if (current !== OPEN_POSITIONS(count) && count === 0) {
    await bulkCloseAllPositions(page);
  }
  await expect(tab).toHaveText(OPEN_POSITIONS(count));
}

async function placeUntilOpenCount(page: Page, count: number, place: () => Promise<void>): Promise<void> {
  const tab = openPositionsTab(page);
  await expect
    .poll(
      async () => {
        const text = (await tab.innerText()).trim();
        if (text === OPEN_POSITIONS(count)) {
          return text;
        }
        await place();
        return (await tab.innerText()).trim();
      },
      { timeout: PLACE_UNTIL_TIMEOUT_MS, intervals: [1_000, 2_000, 3_000] },
    )
    .toBe(OPEN_POSITIONS(count));
}

async function placeMarketOrderWithProtections(page: Page): Promise<void> {
  await page.getByTestId('trade-input-stoploss-price').hover();
  await page.getByTestId('trade-input-stoploss-price-decrease').click();
  await page.getByTestId('trade-input-takeprofit-price').hover();
  for (let click = 0; click < 3; click += 1) {
    await page.getByTestId('trade-input-takeprofit-price-increase').click();
  }
  await page.getByTestId('trade-button-order').click();
  await page.getByTestId('trade-confirmation-button-confirm').click();
}

async function placeOneClickBuy(page: Page): Promise<void> {
  await page.getByTestId('trade-input-volume').click();
  await page.getByTestId('trade-input-volume-increase').click();
  await page.getByTestId('trade-button-oct-order-buy').click();
}

async function bulkCloseAllPositions(page: Page): Promise<void> {
  const tab = openPositionsTab(page);
  await tab.click();
  if ((await tab.innerText()).trim() === OPEN_POSITIONS(0)) {
    return;
  }

  await page.getByTestId('bulk-close').click();
  await page.getByText('All Positions', { exact: true }).click();
  await page.getByTestId('bulk-close-modal-button-submit-all').click();
  await expect(tab).toHaveText(OPEN_POSITIONS(0));
}

async function confirmIfShown(page: Page): Promise<void> {
  const confirm = page.getByTestId('trade-confirmation-button-confirm');
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
  }
}

async function ensureOneClickTrading(page: Page, enabled: boolean): Promise<void> {
  await page.getByTestId('app-setting-dropdown-trigger').click();
  const toggle = page.getByTestId('toggle-oct');
  await expect(toggle).toBeVisible();

  if ((await isToggleOn(toggle)) !== enabled) {
    await toggle.click();
    if (enabled) {
      await page.getByText('Agree and continue', { exact: true }).click();
    }
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
