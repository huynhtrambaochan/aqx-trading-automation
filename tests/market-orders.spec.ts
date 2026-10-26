import { openReadOnlyTerminal } from '../utils/test-helpers';
import { expect, test } from '../fixtures/test-fixtures';

test.describe('read-only market order ticket', () => {
  test.beforeEach(async ({ tradingTerminal }) => {
    await openReadOnlyTerminal(tradingTerminal);
  });

  test.fixme('shows market order protection fields and side controls', async () => {});
  test.fixme('reads one-click trading without changing it', async () => {});

});
test.fixme('checks a zero volume without submitting the ticket', async () => {});

test.describe('demo market execution', { tag: '@execution' }, () => {
  test.fixme('submits a demo market buy with stop loss and take profit', async () => {});
  test.fixme('submits a demo market sell with stop loss and take profit', async () => {});
});
