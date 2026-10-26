import { openReadOnlyTerminal } from '../utils/test-helpers';
import { expect, test } from '../fixtures/test-fixtures';

test.describe('read-only market order ticket', () => {
  test.beforeEach(async ({ tradingTerminal }) => {
    await openReadOnlyTerminal(tradingTerminal);
  });

  test('shows market order protection fields and side controls', async ({ page }) => {
    await expect(page.getByText(/market order/i).first()).toBeVisible();
    await expect(page.getByText(/^buy$/i).first()).toBeVisible();
    await expect(page.getByText(/^sell$/i).first()).toBeVisible();
    await expect(page.getByText(/stop[\s-]*loss/i).first()).toBeVisible();
    await expect(page.getByText(/take[\s-]*profit/i).first()).toBeVisible();
  });

  test('reads one-click trading without changing it', async ({ orderPanel }) => {
    const state = await orderPanel.readOneClickTrading();
    test.info().annotations.push({ type: 'one-click', description: state });
    test.skip(
      state === 'absent',
      'NOT_PRESENT: The one-click switch was not found. TODO: confirm its accessible name. The setting was not changed.',
    );
    expect(state === 'on' || state === 'off').toBe(true);
  });
});

test.fixme('checks a zero volume without submitting the ticket', async () => {});

test.describe('demo market execution', { tag: '@execution' }, () => {
  test.fixme('submits a demo market buy with stop loss and take profit', async () => {});
  test.fixme('submits a demo market sell with stop loss and take profit', async () => {});
});
