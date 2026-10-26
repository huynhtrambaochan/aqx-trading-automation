import { expectVisibleText, openReadOnlyTerminal } from '../utils/test-helpers';
import { test } from '../fixtures/test-fixtures';

test.describe('read-only open positions', () => {
  test.beforeEach(async ({ tradingTerminal }) => {
    await openReadOnlyTerminal(tradingTerminal);
  });

  test('shows the open positions section', async ({ page, tradingTerminal }) => {
    await tradingTerminal.revealTab(/open positions/i);
    await expectVisibleText(page, /open positions/i, 'Open Positions');
  });
});

test.fixme('reads an open position row when one is listed', async () => {});

test.describe('demo position execution', { tag: '@execution' }, () => {
  test.fixme('modifies the stop loss of an open demo position', async () => {});
  test.fixme('partially closes an open demo position', async () => {});
  test.fixme('fully closes an open demo position', async () => {});
});
