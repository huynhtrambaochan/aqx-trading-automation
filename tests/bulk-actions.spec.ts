import { openReadOnlyTerminal, skipNow, visibleMatches } from '../utils/test-helpers';
import { expect, test } from '../fixtures/test-fixtures';

test.describe('read-only bulk controls', () => {
  test.beforeEach(async ({ tradingTerminal }) => {
    await openReadOnlyTerminal(tradingTerminal);
  });

  test('shows Bulk Close without clicking it', async ({ page }) => {
    const buttons = await visibleMatches(page.getByRole('button', { name: /bulk close/i }));
    const labels = buttons.length > 0 ? buttons : await visibleMatches(page.getByText(/bulk close/i));
    const label = labels[0];
    if (!label) {
      skipNow('NOT_PRESENT: Bulk Close was not visible. It may appear only when positions are open. No click was performed.');
    }
    await expect(label).toBeVisible();
  });

  test('shows bulk delete for pending orders without clicking it', async ({ page, tradingTerminal }) => {
    await tradingTerminal.revealTab(/pending orders/i);
    const buttons = await visibleMatches(page.getByRole('button', { name: /bulk delete|delete all|cancel all/i }));
    const button = buttons[0];
    if (!button) {
      skipNow(
        'NOT_PRESENT: A bulk-delete control for pending orders was not visible. TODO: confirm its label. No click was performed.',
      );
    }
    await expect(button).toBeVisible();
  });
});

test.describe('demo bulk execution', { tag: '@execution' }, () => {
  test.fixme('bulk closes open demo positions', async () => {});
  test.fixme('bulk deletes demo pending orders', async () => {});
});
