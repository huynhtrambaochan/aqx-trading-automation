import { expect, type Locator, type Page } from '@playwright/test';

import { resolveBaseUrl, safePageUrl } from '../utils/env';
import { ORDER_TYPE_NAMES, type OrderTypeName, visibleMatches } from '../utils/test-helpers';

export type MarketStatus = 'open' | 'closed' | 'unknown';

export type TerminalInspection =
  | { status: 'ready'; reason: string }
  | { status: 'login-required'; reason: string }
  | { status: 'not-terminal'; reason: string };

const TERMINAL_DETECT_TIMEOUT_MS = 8_000;

/**
 * Read-only view of the trading terminal.
 *
 * Confirmed in the demo UI:
 * - data-testid="trade-dropdown-order-type"
 * - option labels Market, Limit, Stop, and Stop Limit
 *
 * TODO: Confirm every other landmark against the live DOM. Text and roles below
 * are defensive labels, not invented data-testid values.
 */
export class TradingTerminalPage {
  readonly page: Page;

  readonly orderTypeDropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.orderTypeDropdown = page.getByTestId('trade-dropdown-order-type');
  }

  async goto(): Promise<void> {
    // Use the absolute BASE_URL. A leading slash would drop the path and open the site root.
    const response = await this.page.goto(resolveBaseUrl(), { waitUntil: 'domcontentloaded' });
    if (response && response.status() >= 400) {
      throw new Error(
        `BASE_URL returned HTTP ${response.status()} for ${safePageUrl(this.page.url())}.`,
      );
    }
  }

  async inspect(): Promise<TerminalInspection> {
    const marketingHeading = this.page.getByRole('heading', { name: /white-label multi-asset trading/i });
    await this.orderTypeDropdown
      .or(marketingHeading)
      .first()
      .waitFor({ state: 'visible', timeout: TERMINAL_DETECT_TIMEOUT_MS })
      .catch(() => undefined);

    if ((await visibleMatches(this.orderTypeDropdown)).length > 0) {
      return {
        status: 'ready',
        reason: 'The observed order-type dropdown is visible.',
      };
    }

    if (await this.isLoginWall()) {
      return {
        status: 'login-required',
        reason:
          'AUTH_REQUIRED: A login form is visible and the trading terminal is not. Complete the manual login in the README, then rerun with STORAGE_STATE. No credentials were entered.',
      };
    }

    return {
      status: 'not-terminal',
      reason:
        `NOT_TERMINAL: data-testid="trade-dropdown-order-type" was not visible at ${safePageUrl(this.page.url())} ` +
        `(waited up to ${TERMINAL_DETECT_TIMEOUT_MS}ms). Set BASE_URL to the trading terminal. No trading action was performed.`,
    };
  }

  async isLoginWall(): Promise<boolean> {
    for (const input of await this.page.locator('input[type="password"]').all()) {
      if (await input.isVisible()) {
        return true;
      }
    }
    return false;
  }

  /**
   * The only status text observed in the assessment notes is "MARKET CLOSED".
   * This method does not return `open`. Guessed phrases such as "Market Open"
   * are not evidence that trading is allowed.
   * TODO: Return `open` only after the live open-session control has been identified.
   */
  async getMarketStatus(options: { waitMs?: number } = {}): Promise<MarketStatus> {
    const waitMs = options.waitMs ?? 0;
    if (waitMs > 0) {
      await this.page
        .getByText(/market\s*closed/i)
        .first()
        .waitFor({ state: 'visible', timeout: waitMs })
        .catch(() => undefined);
    }

    if (await this.anyTextVisible(/market\s*closed/i)) {
      return 'closed';
    }
    return 'unknown';
  }

  async readOrderTypeOptions(): Promise<string[]> {
    await expect(this.orderTypeDropdown).toBeVisible();
    const select = this.orderTypeDropdown.locator('select');
    const nativeSelect = (await select.count()) === 1 ? select : this.orderTypeDropdown;
    const tagName = await nativeSelect.evaluate((element) => element.tagName.toLowerCase());

    if (tagName === 'select') {
      const labels = await nativeSelect.locator('option').allTextContents();
      return labels.map((label) => label.trim()).filter((label) => label.length > 0);
    }

    await this.openOrderTypeDropdown();
    try {
      const options = await visibleMatches(this.page.getByRole('option'));
      const menuItems = options.length > 0 ? options : await visibleMatches(this.page.getByRole('menuitem'));
      const labels: string[] = [];
      for (const item of menuItems) {
        const text = (await item.innerText()).trim();
        if (text.length > 0) {
          labels.push(text);
        }
      }
      return labels;
    } finally {
      await this.page.keyboard.press('Escape');
    }
  }

  async openOrderTypeDropdown(): Promise<void> {
    const root = this.orderTypeDropdown;
    await expect(root).toBeVisible();

    const tagName = await root.evaluate((element) => element.tagName.toLowerCase());
    if (tagName === 'select') {
      return;
    }

    const innerSelect = root.locator('select');
    if ((await innerSelect.count()) === 1) {
      return;
    }

    const role = await root.getAttribute('role');
    if (role === 'combobox' || role === 'button' || role === 'listbox') {
      await root.click();
      return;
    }

    const comboboxes = await visibleMatches(root.getByRole('combobox'));
    const combobox = comboboxes[0];
    if (comboboxes.length === 1 && combobox) {
      await combobox.click();
      return;
    }

    // The observed test id belongs to the dropdown. Click that element itself
    // rather than the first button inside a larger wrapper.
    await root.click();
  }

  async revealTab(name: RegExp): Promise<void> {
    const tabs = await visibleMatches(this.page.getByRole('tab', { name }));
    const tab = tabs[0];
    if (tab) {
      await tab.click();
    }
  }

  private async anyTextVisible(pattern: RegExp): Promise<boolean> {
    return (await visibleMatches(this.page.getByText(pattern))).length > 0;
  }
}

export function orderTypeLabelMatches(labels: readonly string[], expected: OrderTypeName): boolean {
  return labels.some((label) => {
    const firstLine = label.split('\n')[0]?.trim().toLowerCase() ?? '';
    return firstLine === expected.toLowerCase();
  });
}

export { ORDER_TYPE_NAMES };
