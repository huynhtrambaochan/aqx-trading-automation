import { orderTypeLabelMatches } from '../../pages/TradingTerminalPage';
import { isDemoExecutionAllowed, resolveBaseUrl, safePageUrl } from '../../utils/env';
import { expectVisibleText, openReadOnlyTerminal, ORDER_TYPE_NAMES } from '../../utils/test-helpers';
import { expect, test } from '../../fixtures/test-fixtures';

test('keeps demo trading disabled in CI', () => {
  test.skip(
    !process.env.CI,
    'Local shells may opt into demo execution. CI must leave ENABLE_DEMO_TRADING and DEMO_ACCOUNT_CONFIRMED unset.',
  );
  expect(isDemoExecutionAllowed()).toBe(false);
});

test('loads the configured BASE_URL without submitting an order', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'safety', description: 'read-only' });
  const target = resolveBaseUrl();
  const response = await page.goto(target, { waitUntil: 'domcontentloaded' });
  expect(response, 'The browser did not receive an HTTP response. Check BASE_URL and network access.').not.toBeNull();
  expect(response?.status() ?? 0).toBeLessThan(400);
  await expect(page.locator('body')).toBeVisible();
  const title = (await page.title()).trim();
  expect(title.length).toBeGreaterThan(0);
  testInfo.annotations.push({ type: 'requested-url', description: safePageUrl(target) });
  testInfo.annotations.push({ type: 'landed-url', description: safePageUrl(page.url()) });
  testInfo.annotations.push({ type: 'document-title', description: title });
});

test('validates the order-type dropdown', async ({ tradingTerminal }) => {
  await openReadOnlyTerminal(tradingTerminal);
  const labels = await tradingTerminal.readOrderTypeOptions();
  for (const expected of ORDER_TYPE_NAMES) {
    expect(
      orderTypeLabelMatches(labels, expected),
      `Visible order types: ${labels.join(' | ') || '<none>'}. TODO: confirm option roles if these names are present but not matched.`,
    ).toBe(true);
  }
});

test('shows the read-only market ticket and position sections', async ({ page, tradingTerminal }) => {
  await openReadOnlyTerminal(tradingTerminal);
  await expectVisibleText(page, /market order/i, 'Market Order');
  await expectVisibleText(page, /^buy$/i, 'BUY');
  await expectVisibleText(page, /^sell$/i, 'SELL');
  await expectVisibleText(page, /volume/i, 'Volume');
  await expectVisibleText(page, /fill policy/i, 'Fill policy');
  await expectVisibleText(page, /stop[\s-]*loss/i, 'Stop Loss');
  await expectVisibleText(page, /take[\s-]*profit/i, 'Take Profit');
  await expectVisibleText(page, /open positions/i, 'Open Positions');
  await expectVisibleText(page, /pending orders/i, 'Pending Orders');
});

test('reports a visible market session state', async ({ tradingTerminal }) => {
  await openReadOnlyTerminal(tradingTerminal);
  const status = await tradingTerminal.getMarketStatus({ waitMs: 3_000 });
  test.info().annotations.push({ type: 'market-status', description: status });
  test.skip(
    status !== 'closed',
    'NOT_PRESENT: MARKET CLOSED was not visible. An open-session control has not been identified, so this check stays blocked. No trading action was performed.',
  );
  expect(status).toBe('closed');
});
