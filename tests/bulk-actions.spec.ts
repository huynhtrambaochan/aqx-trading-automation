import { openReadOnlyTerminal, skipNow, visibleMatches } from '../utils/test-helpers';
import { expect, test } from '../fixtures/test-fixtures';

test.describe('read-only bulk controls', () => {
  test.beforeEach(async ({ tradingTerminal }) => {
    await openReadOnlyTerminal(tradingTerminal);
  });
  test.fixme('shows Bulk Close without clicking it', async () => {});
  test.fixme('shows bulk delete for pending orders without clicking it', async () => {});

});

test.describe('demo bulk execution', { tag: '@execution' }, () => {
  test.fixme('bulk closes open demo positions', async () => {});
  test.fixme('bulk deletes demo pending orders', async () => {});
});
