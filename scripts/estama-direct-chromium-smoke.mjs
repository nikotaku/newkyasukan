// Browserbase-free, read-only Playwright smoke test for the Estama Soul login page.
// It NEVER signs in, submits a form, creates a diary, or reads account credentials.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const targetUrl = "https://estama.jp/tamathera/login/";
const started = Date.now();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const page = await context.newPage();
  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 35_000 });
  assert.ok(response, "No HTTP response from login page");
  const status = response.status();
  const resolved = new URL(page.url());
  assert.equal(resolved.hostname, "estama.jp", "Unexpected destination after navigation");
  console.log(JSON.stringify({
    event: "estama_direct_chromium_smoke",
    mode: "read_only_no_credentials",
    browser: browser.version(),
    httpStatus: status,
    hostname: resolved.hostname,
    elapsedMs: Date.now() - started,
  }));
  assert.ok(status >= 200 && status < 400, `Estama returned HTTP ${status}; access restrictions may apply`);
  await context.close();
} catch (error) {
  console.error(JSON.stringify({
    event: "estama_direct_chromium_smoke_failed",
    reason: error instanceof Error ? error.message.slice(0, 350) : String(error).slice(0, 350),
  }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
