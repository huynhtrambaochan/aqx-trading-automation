import { test as base } from '@playwright/test';

import { OrderPanel } from '../pages/OrderPanel';
import { TradingTerminalPage } from '../pages/TradingTerminalPage';

type AppFixtures = {
  tradingTerminal: TradingTerminalPage;
  orderPanel: OrderPanel;
};

export const test = base.extend<AppFixtures>({
  tradingTerminal: async ({ page }, use) => {
    await use(new TradingTerminalPage(page));
  },
  orderPanel: async ({ page }, use) => {
    await use(new OrderPanel(page));
  },
});

export { expect } from '@playwright/test';
