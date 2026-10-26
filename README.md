# AQX Trader Playwright assessment

Portable UI automation for the AQX Trader web platform. The suite is written in TypeScript and runs with Playwright Test in Chromium. It is meant to be zipped, pushed to GitHub, and executed in a cloud environment such as GitHub Codespaces.

The public assessment address, <https://www.aquariux.com/solutions/trader/>, is a marketing page. It is the default `BASE_URL` so the project starts without a secret, and it is **not** assumed to be the trading terminal. Point `BASE_URL` at the demo terminal before expecting terminal checks to run.

This repository does not claim that every assessment requirement has been executed against a live terminal. Simple checks have scripts. Complex order, position, and detail cases are listed by name only and have no steps. A skipped test is not a pass.

## Purpose and scope

The suite covers the assessment areas below.

| Area | What the project does |
| --- | --- |
| Market buy and sell, with Stop Loss and Take Profit | The simple script checks that the ticket labels are visible. Buy and sell cases are names only. |
| One-click trading | The simple script reads the switch when it can be found. Automation never turns it on. |
| Pending orders: Limit, Stop, Stop Limit, and expiry | Names only. No field or submit steps are written. |
| Open positions | The simple script checks that the section is visible. Row details, modify, and close are names only. |
| Bulk close | The simple script checks that the controls are visible and does not click them. The bulk actions are names only. |
| History, notifications, orders, and deals | The simple scripts check that the sections and a notifications control are visible. |
| Order details | The price, quantity, and status cases are names only. |

## Safety model

A trading action is possible only when all of these are true:

1. `ENABLE_DEMO_TRADING` is the exact string `true`.
2. `DEMO_ACCOUNT_CONFIRMED` is the exact string `true`.
3. The order-type dropdown is visible at `BASE_URL`.
4. `getMarketStatus()` returns `open`. That return is not implemented. The only observed status text is `MARKET CLOSED`, which blocks execution.
5. The one-click control is visible and off. A missing control blocks execution.
6. The command uses one worker: `npm run test:execution`.
7. The Buy, Sell, Close, or Delete control is the only visible match inside the order ticket.

The demo execution cases are names only. They do not navigate, click, or submit.

Use this only on a demo or test account. The project has no real-money mode.

## Open it in GitHub Codespaces
 
1. Open the repository on GitHub.
2. Click **Code**.
3. Choose the **Codespaces** tab.
4. Click **Create codespace on main**.
5. Wait until the terminal prompt appears.
 
The Codespace browser is a new machine. A login saved in your laptop browser is not available there.
 
## Install dependencies and Chromium
 
In the Codespace terminal:
 
```bash
cd aqx-trading-automation   # skip this if the codespace opened inside the project
node -v                     # expect v20 or newer
npm ci
npx playwright install --with-deps chromium
npm run typecheck
npm run check:env
npm run test:list
npm run test:smoke
npm test
```
 
`npm ci` installs the locked dependencies, including Playwright. `.npmrc` points that install at the public npm registry. `npx playwright install --with-deps chromium` downloads Chromium and the operating-system libraries it needs. The environment check prints whether demo execution is disabled. It prints `<redacted>` or `<unset>` for passwords and never prints the password itself.
 
## Set BASE_URL
 
For a first smoke run you can leave the default. Terminal tests will skip until you set the real terminal address.
 
```bash
export BASE_URL="https://your-demo-terminal.example/path"
export TRADING_USERNAME='xxx'
export TRADING_PASSWORD='xxx'
```

## Project structure

```text
aqx-trading-automation/
├── tests/
├── pages/
├── fixtures/test-fixtures.ts
├── utils/env.ts
├── .github/workflows/playwright.yml
├── package.json
├── package-lock.json
├── playwright.config.ts
├── tsconfig.json
└── README.md
```

`package-lock.json` is created by npm and is required for `npm ci`.

## Run the tests

Safe default:

```bash
npm run test:smoke
```

The full suite. Complex cases are marked fixme and are not executed:

```bash
npm test
```

`npm run test:execution` selects the named demo cases. Those cases have no steps, so the command does not place or close orders.

Other commands:

```bash
npm run test:list      # show the test names without running them
```

The config uses a 60 second test timeout and a 10 second assertion timeout. Screenshots, traces, and video are kept when a test fails. Retries are off, so a failure stays a failure.
