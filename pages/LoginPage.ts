import { type Locator, type Page } from '@playwright/test';

import { resolveBaseUrl, safePageUrl } from '../utils/env';

export type TradingCredentials = {
  username: string;
  password: string;
};

const ORDER_TYPE_DROPDOWN = 'trade-dropdown-order-type';
const FORM_WAIT_MS = 8_000;
const TERMINAL_WAIT_MS = 20_000;

/**
 * Signs in with TRADING_USERNAME and TRADING_PASSWORD.
 * The only confirmed terminal selector is data-testid="trade-dropdown-order-type".
 * Username, password, and submit controls use accessible roles. TODO: confirm those
 * labels on the live login form. This function does not place, close, or delete orders,
 * and it does not print the password.
 */
export async function login(page: Page, credentials: TradingCredentials): Promise<void> {
  const target = resolveBaseUrl();
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (response && response.status() >= 400) {
    throw new Error(
      `LOGIN_PAGE_UNAVAILABLE: BASE_URL returned HTTP ${response.status()} for ${safePageUrl(page.url())}.`,
    );
  }

  const dropdown = page.getByTestId(ORDER_TYPE_DROPDOWN);
  if (await isVisible(dropdown)) {
    return;
  }

  const passwordField = await waitForPasswordField(page, dropdown);
  if (!passwordField) {
    return;
  }

  const scope = await formScope(passwordField, page);
  const usernameField = await firstUnique(
    usernameCandidates(scope),
    `LOGIN_FORM_UNCONFIRMED: The username field was not uniquely visible at ${safePageUrl(page.url())}. No credentials were entered.`,
  );
  await usernameField.fill(credentials.username);
  await passwordField.fill(credentials.password);
  await submitLogin(scope, passwordField);

  try {
    await dropdown.first().waitFor({ state: 'visible', timeout: TERMINAL_WAIT_MS });
  } catch {
    const where = safePageUrl(page.url());
    if (await isVisible(page.locator('input[type="password"]'))) {
      throw new Error(
        `LOGIN_FAILED: The password field is still visible at ${where}. The username and password were not printed. No trading action was performed.`,
      );
    }
    throw new Error(
      `LOGIN_FAILED: The order-type dropdown was not visible at ${where} after sign-in. The GUI was not verified. No trading action was performed.`,
    );
  }
}

async function waitForPasswordField(page: Page, dropdown: Locator): Promise<Locator | undefined> {
  const password = page.locator('input[type="password"]');
  await password.or(dropdown).first().waitFor({ state: 'visible', timeout: FORM_WAIT_MS }).catch(() => undefined);
  if (await isVisible(dropdown)) {
    return undefined;
  }
  const fields = await visibleMatches(password);
  const field = fields[0];
  if (fields.length !== 1 || !field) {
    throw new Error(
      `LOGIN_FORM_UNCONFIRMED: Expected one visible password field at ${safePageUrl(page.url())}, found ${fields.length}. No credentials were entered.`,
    );
  }
  return field;
}

async function formScope(passwordField: Locator, page: Page): Promise<Page | Locator> {
  const form = passwordField.locator('xpath=ancestor::form[1]');
  if ((await form.count()) > 0) {
    return form;
  }
  return page;
}

function usernameCandidates(scope: Page | Locator): Locator[] {
  const named = /user\s*name|username|e-?mail|login|account/i;
  return [
    scope.getByRole('textbox', { name: named }),
    scope.getByLabel(named),
    scope.getByPlaceholder(named),
    scope.locator('input[type="email"]'),
    scope.locator(
      'input[type="text"], input:not([type]), input[name*="user" i], input[name*="email" i], input[id*="user" i], input[id*="email" i]',
    ),
  ];
}

async function submitLogin(scope: Page | Locator, passwordField: Locator): Promise<void> {
  const named = /log\s*in|sign\s*in|sign\s*on|submit/i;
  const candidates = [
    scope.locator('button[type="submit"], input[type="submit"]'),
    scope.getByRole('button', { name: named }),
  ];
  for (const candidate of candidates) {
    const matches = await visibleMatches(candidate);
    const match = matches[0];
    if (matches.length === 1 && match) {
      await match.click();
      return;
    }
  }
  await passwordField.press('Enter');
}

async function firstUnique(candidates: Locator[], failure: string): Promise<Locator> {
  for (const candidate of candidates) {
    const matches = await visibleMatches(candidate);
    const match = matches[0];
    if (matches.length === 1 && match && !(await isPasswordInput(match))) {
      return match;
    }
  }
  throw new Error(failure);
}

async function isPasswordInput(locator: Locator): Promise<boolean> {
  return locator.evaluate((node) => node instanceof HTMLInputElement && node.type === 'password');
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
