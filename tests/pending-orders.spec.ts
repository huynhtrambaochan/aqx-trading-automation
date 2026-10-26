import { test } from '../fixtures/test-fixtures';

test.describe('read-only pending order fields', () => {
  test.fixme('shows a price field when Limit is selected', async () => {});
  test.fixme('shows a stop price field when Stop is selected', async () => {});
  test.fixme('shows stop and limit prices when Stop Limit is selected', async () => {});
  test.fixme('inspects expiry when the ticket shows it', async () => {});
});

test.describe('demo pending-order execution', { tag: '@execution' }, () => {
  test.fixme('submits a demo limit order', async () => {});
  test.fixme('submits a demo stop order', async () => {});
  test.fixme('submits a demo stop-limit order', async () => {});
  test.fixme('deletes one demo pending order when one is open', async () => {});
});
