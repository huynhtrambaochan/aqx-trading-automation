import { test, type Locator, type Page } from '@playwright/test';

import { resolveBaseUrl, safePageUrl } from '../utils/env';

export type TradingCredentials = {
  username: string;
  password: string;
};

const LOGIN_URL = 'https://aqxtrader.aquariux.com/web/login';
const USER_ID = 'login-user-id';
const PASSWORD = 'login-password';
const SUBMIT = 'login-submit';
const ORDER_TYPE_DROPDOWN = 'trade-dropdown-order-type';
const FORM_WAIT_MS = 8_000;
const TERMINAL_WAIT_MS = 20_000;

/**
 * Signs in with TRADING_USERNAME and TRADING_PASSWORD.
 * Confirmed login controls: data-testid="login-user-id", "login-password", and "login-submit".
 * Confirmed terminal control: data-testid="trade-dropdown-order-type".
 * This function does not place, close, or delete orders, and it does not print the password.
 */
export async function login(page: Page, credentials: TradingCredentials): Promise<void> {
  const response = await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (response && response.status() >= 400) {
    throw new Error(
      `LOGIN_PAGE_UNAVAILABLE: ${LOGIN_URL} returned HTTP ${response.status()} for ${safePageUrl(page.url())}.`,
    );
  }

  const dropdown = page.getByTestId(ORDER_TYPE_DROPDOWN);
  const passwordField = page.getByTestId(PASSWORD);
  await passwordField.or(dropdown).first().waitFor({ state: 'visible', timeout: FORM_WAIT_MS }).catch(() => undefined);
  if (await isVisible(dropdown)) {
    await takeSnapshot(page, 'after-login');
    return;
  }

  const userId = await requireVisible(page, USER_ID);
  const password = await requireVisible(page, PASSWORD);
  const submit = await requireVisible(page, SUBMIT);

  await takeSnapshot(page, 'login-page', [password]);
  await userId.fill(credentials.username);
  await password.fill(credentials.password);
  await submit.click();

  try {
    await dropdown.first().waitFor({ state: 'visible', timeout: TERMINAL_WAIT_MS });
  } catch {
    const where = safePageUrl(page.url());
    if (await isVisible(page.getByTestId(PASSWORD))) {
      throw new Error(
        `LOGIN_FAILED: data-testid="${PASSWORD}" is still visible at ${where}. The username and password were not printed. No trading action was performed.`,
      );
    }
    throw new Error(
      `LOGIN_FAILED: data-testid="${ORDER_TYPE_DROPDOWN}" was not visible at ${where} after sign-in. The GUI was not verified. No trading action was performed.`,
    );
  }

  await takeSnapshot(page, 'after-login');
}

async function requireVisible(page: Page, testId: string): Promise<Locator> {
  const locator = page.getByTestId(testId);
  await locator.first().waitFor({ state: 'visible', timeout: FORM_WAIT_MS }).catch(() => undefined);
  const matches = await visibleMatches(locator);
  const match = matches[0];
  if (matches.length !== 1 || !match) {
    throw new Error(
      `LOGIN_FORM_UNCONFIRMED: Expected one visible data-testid="${testId}" at ${safePageUrl(page.url())}, found ${matches.length}. No credentials were entered.`,
    );
  }
  return match;
}

async function takeSnapshot(page: Page, name: string, mask: Locator[] = []): Promise<void> {
  await test.step(`snapshot ${name}`, async () => {
    const file = test.info().outputPath(`${name}.png`);
    await page.screenshot({ path: file, fullPage: true, mask });
    await test.info().attach(name, { path: file, contentType: 'image/png' });
  });
}

async function isVisible(locator: Locator): Promise<boolean> {
  return (await visibleMatches(locator)).length > 0;
}

async function visibleMatches(locator: Locator): Promise<Locator[]> {
  const matches: Locator[] = [];
  for (const item of await locator.all()) {
    if (await item.isVisible()) {
      matches.push(item);
    }
  }
  return matches;
}
