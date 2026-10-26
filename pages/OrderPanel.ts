import { expect, type Locator, type Page } from '@playwright/test';

import { assertDemoExecutionAllowed } from '../utils/env';
import {
  parseDisplayedPrice,
  skipUnlessSingleVisible,
  type OrderTypeName,
  visibleMatches,
} from '../utils/test-helpers';
import { TradingTerminalPage, type MarketStatus } from './TradingTerminalPage';

const VOLUME_PATTERNS = [/volume/i] as const;
const STOP_LOSS_PATTERNS = [/stop[\s-]*loss/i] as const;
const TAKE_PROFIT_PATTERNS = [/take[\s-]*profit/i] as const;

/**
 * Order ticket actions.
 *
 * There is intentionally no method that enables one-click trading.
 * Methods that submit, modify, close, or delete call the demo-execution guard
 * before they look for a click target.
 */
export class OrderPanel {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** TODO: Confirm the ticket container. The dropdown test id is the only observed anchor. */
  scopedRoot(): Locator {
    return this.page.locator('form, section, aside, [role="region"]').filter({
      has: this.page.getByTestId('trade-dropdown-order-type'),
    });
  }

  buyButton(): Locator {
    return this.actionButton(/^buy$/i);
  }

  sellButton(): Locator {
    return this.actionButton(/^sell$/i);
  }

  async selectOrderType(name: OrderTypeName): Promise<void> {
    const dropdown = this.page.getByTestId('trade-dropdown-order-type');
    await expect(dropdown).toBeVisible();

    const select = dropdown.locator('select');
    const nativeSelect = (await select.count()) >= 1 ? select.first() : dropdown;
    const tagName = await nativeSelect.evaluate((element) => element.tagName.toLowerCase());
    if (tagName === 'select') {
      await nativeSelect.selectOption({ label: name });
      return;
    }

    const terminal = new TradingTerminalPage(this.page);
    await terminal.openOrderTypeDropdown();

    const options = await visibleMatches(this.page.getByRole('option', { name, exact: true }));
    const option = options[0];
    if (options.length === 1 && option) {
      await option.click();
      return;
    }

    const menuItems = await visibleMatches(this.page.getByRole('menuitem', { name, exact: true }));
    const menuItem = menuItems[0];
    if (options.length === 0 && menuItems.length === 1 && menuItem) {
      await menuItem.click();
      return;
    }

    skipUnlessSingleVisible([], `${name} order type`);
  }

  /**
   * Reads the one-click control. This method does not click or change it.
   * TODO: Confirm whether the control is a switch in the ticket or a settings page.
   */
  async readOneClickTrading(): Promise<'on' | 'off' | 'absent'> {
    const candidates = [
      this.page.getByRole('switch', { name: /one[\s-]*click/i }),
      this.page.getByRole('checkbox', { name: /one[\s-]*click/i }),
    ];

    for (const candidate of candidates) {
      const matches = await visibleMatches(candidate);
      const control = matches[0];
      if (matches.length !== 1 || !control) {
        continue;
      }
      return (await control.isChecked()) ? 'on' : 'off';
    }

    return 'absent';
  }

  async readReferencePrice(): Promise<number | undefined> {
    for (const pattern of [/^bid$/i, /^ask$/i, /^price$/i]) {
      const labeled = await visibleMatches(this.page.getByLabel(pattern));
      const spinbuttons = await visibleMatches(this.page.getByRole('spinbutton', { name: pattern }));
      const textboxes = await visibleMatches(this.page.getByRole('textbox', { name: pattern }));
      const groups = [labeled, spinbuttons, textboxes];
      if (groups.some((group) => group.length > 1)) {
        continue;
      }
      const uniqueGroups = groups.filter((group) => group.length === 1);
      const field = uniqueGroups.length === 1 ? uniqueGroups[0]?.[0] : undefined;
      if (!field) {
        continue;
      }
      let raw = '';
      try {
        raw = await field.inputValue();
      } catch {
        raw = await field.innerText();
      }
      const parsed = parseDisplayedPrice(raw);
      if (parsed !== undefined) {
        return parsed;
      }
    }

    return undefined;
  }

  async fillVolume(volume: string): Promise<void> {
    await this.fillUniqueField(VOLUME_PATTERNS, volume, 'volume');
  }

  async fillStopLoss(value: string): Promise<void> {
    await this.fillUniqueField(STOP_LOSS_PATTERNS, value, 'stop loss');
  }

  async fillTakeProfit(value: string): Promise<void> {
    await this.fillUniqueField(TAKE_PROFIT_PATTERNS, value, 'take profit');
  }

  async fillNamedField(patterns: readonly RegExp[], value: string, fieldName: string): Promise<void> {
    await this.fillUniqueField(patterns, value, fieldName);
  }

  async submitBuy(): Promise<void> {
    await this.clickTradingControl(this.buyButton(), 'BUY');
  }

  async submitSell(): Promise<void> {
    await this.clickTradingControl(this.sellButton(), 'SELL');
  }

  async modifyFirstPosition(stopLoss: string): Promise<void> {
    await this.clickTradingControl(
      this.page.getByRole('button', { name: /^(modify|edit)$/i }),
      'modify position',
    );

    const dialog = this.page.getByRole('dialog');
    if (!(await dialog.isVisible().catch(() => false))) {
      throw new Error(
        'Refusing to edit a position outside a dialog. The modify flow has not been verified, so no page-level field was changed.',
      );
    }
    const stopLossInput = skipUnlessSingleVisible(
      await visibleMatches(dialog.getByLabel(/stop[\s-]*loss/i)),
      'position stop loss',
    );
    await stopLossInput.fill(stopLoss);
    const save = skipUnlessSingleVisible(
      await visibleMatches(dialog.getByRole('button', { name: /^(save|update|confirm)$/i })),
      'save position modification',
    );
    await save.click();
  }

  async partialCloseFirstPosition(volume: string): Promise<void> {
    await this.clickTradingControl(
      this.page.getByRole('button', { name: /partial close/i }),
      'partial close',
    );

    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const volumeInput = skipUnlessSingleVisible(
      await visibleMatches(dialog.getByLabel(/volume/i)),
      'partial-close volume',
    );
    await volumeInput.fill(volume);
    const confirm = skipUnlessSingleVisible(
      await visibleMatches(dialog.getByRole('button', { name: /^(confirm|submit)$/i })),
      'confirm partial close',
    );
    await confirm.click();
  }

  async fullCloseFirstPosition(): Promise<void> {
    await this.clickTradingControl(this.page.getByRole('button', { name: /^close$/i }), 'close position');
    await this.confirmVisibleDialog(/^(confirm|yes)$/i, 'confirm close position');
  }

  async bulkClose(): Promise<void> {
    await this.clickTradingControl(this.page.getByRole('button', { name: /bulk close/i }), 'bulk close');
    await this.confirmVisibleDialog(/^(confirm|yes)$/i, 'confirm bulk close');
  }

  async bulkDeletePending(): Promise<void> {
    await this.clickTradingControl(
      this.page.getByRole('button', { name: /bulk delete|delete all|cancel all/i }),
      'bulk delete pending orders',
    );
    await this.confirmVisibleDialog(/^(confirm|yes)$/i, 'confirm bulk delete');
  }

  async deleteFirstPendingOrder(): Promise<void> {
    await this.clickTradingControl(
      this.page.getByRole('button', { name: /^(delete|cancel)$/i }),
      'delete pending order',
    );
    await this.confirmVisibleDialog(/^(confirm|yes)$/i, 'confirm delete pending order');
  }

  private actionButton(name: RegExp): Locator {
    // Stay inside the ticket that contains the observed order-type dropdown.
    // A page-wide Buy or Sell match is not used.
    return this.scopedRoot().getByRole('button', { name });
  }

  private async fillUniqueField(patterns: readonly RegExp[], value: string, fieldName: string): Promise<void> {
    for (const pattern of patterns) {
      const labeled = await visibleMatches(this.page.getByLabel(pattern));
      const spinbuttons = await visibleMatches(this.page.getByRole('spinbutton', { name: pattern }));
      const textboxes = await visibleMatches(this.page.getByRole('textbox', { name: pattern }));
      const groups = [labeled, spinbuttons, textboxes];
      if (groups.some((group) => group.length > 1)) {
        continue;
      }
      const uniqueGroups = groups.filter((group) => group.length === 1);
      const field = uniqueGroups.length === 1 ? uniqueGroups[0]?.[0] : undefined;
      if (field) {
        await field.fill(value);
        return;
      }
    }

    skipUnlessSingleVisible([], fieldName);
  }

  private async clickTradingControl(locator: Locator, actionName: string): Promise<void> {
    await this.assertCanTrade();
    const target = skipUnlessSingleVisible(await visibleMatches(locator), actionName);
    await target.click();
  }

  private async confirmVisibleDialog(name: RegExp, actionName: string): Promise<void> {
    const dialog = this.page.getByRole('dialog');
    if (!(await dialog.isVisible().catch(() => false))) {
      throw new Error(
        `Refusing to treat ${actionName} as complete because no confirmation dialog was visible. The confirmation UI has not been verified.`,
      );
    }
    const confirm = skipUnlessSingleVisible(
      await visibleMatches(dialog.getByRole('button', { name })),
      actionName,
    );
    await confirm.click();
  }

  private async assertCanTrade(): Promise<void> {
    assertDemoExecutionAllowed();
    const status: MarketStatus = await new TradingTerminalPage(this.page).getMarketStatus({ waitMs: 1_000 });
    if (status === 'closed') {
      throw new Error(
        'Refusing to perform a trading action because the terminal reports MARKET CLOSED. No order was submitted.',
      );
    }
    if (status !== 'open') {
      throw new Error(
        'Refusing to perform a trading action because the market status is not confirmed open. No order was submitted.',
      );
    }
  }
}
