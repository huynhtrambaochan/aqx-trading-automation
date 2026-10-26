import { expectVisibleText, firstVisible, openReadOnlyTerminal, skipNow } from '../utils/test-helpers';
import { expect, test } from '../fixtures/test-fixtures';

test.describe('read-only history and notifications', () => {
  test.beforeEach(async ({ tradingTerminal }) => {
    await openReadOnlyTerminal(tradingTerminal);
  });

  test('shows Positions History', async ({ page, tradingTerminal }) => {
    await tradingTerminal.revealTab(/positions history|position history/i);
    await expectVisibleText(page, /positions history|position history/i, 'Positions History');
  });

  test('shows Orders and Deals', async ({ page, tradingTerminal }) => {
    await tradingTerminal.revealTab(/orders\s*(&|and)\s*deals/i);
    await expectVisibleText(page, /orders\s*(&|and)\s*deals/i, 'Orders & Deals');
  });

  test('shows a notifications control when one is present', async ({ page }) => {
    const control = await firstVisible(page.getByRole('button', { name: /notification/i }));
    if (!control) {
      skipNow('NOT_PRESENT: No notifications control was visible. TODO: confirm its accessible name. It was not opened.');
    }
    await expect(control).toBeVisible();
  });
});

test.fixme('reads order or deal values when rows are listed', async () => {});
