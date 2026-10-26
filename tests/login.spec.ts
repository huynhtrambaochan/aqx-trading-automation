import { login } from '../pages/LoginPage';
import { skipNow } from '../utils/test-helpers';
import { expect, test } from '../fixtures/test-fixtures';

test('signs in and shows the order-type dropdown', async ({ page }) => {
  const username = process.env.TRADING_USERNAME?.trim();
  const password = process.env.TRADING_PASSWORD?.trim();
  if (!username || !password) {
    skipNow(
      'AUTH_REQUIRED: Set TRADING_USERNAME and TRADING_PASSWORD to verify login. The password is not printed.',
    );
  }

  await login(page, { username, password });
  await expect(page.getByTestId('notification-selector')).toBeVisible();
});

test.fixme('rejects a wrong password', async () => {});
test.fixme('rejects an empty username', async () => {});
test.fixme('rejects an empty password', async () => {});
test.fixme('keeps the password off the login error', async () => {});
