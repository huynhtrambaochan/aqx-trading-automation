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
