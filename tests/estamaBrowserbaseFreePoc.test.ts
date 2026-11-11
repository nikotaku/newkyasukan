import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../server/estama-automation.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function runPreparedEstamaDiaryOnPage(");
const end = source.indexOf("// Production transport is unchanged", start);
const directFlow = source.slice(start, end);

test("Soul diary Playwright actions can run on a provided Page without creating Browserbase sessions", () => {
  assert.ok(start >= 0 && end > start, "Browserbase-free page flow must be exported");
  assert.doesNotMatch(directFlow, /getBrowserbase\(|createBrowserSession\(|connectSession\(|releaseSession\(|connectOverCDP\(/);
  assert.match(directFlow, /loginSoulTherapist\(/);
  assert.match(directFlow, /attachEstamaDiaryPhoto\(/);
  assert.match(directFlow, /verifyEstamaDiarySubmission\(/);
  assert.match(directFlow, /verifyPublishedEstamaDiary\(/);
});

test("Existing production route keeps its Browserbase transport during the trial", () => {
  const remaining = source.slice(end, source.indexOf("async function claimNextJob", end));
  assert.match(remaining, /export async function runPreparedEstamaDiary\(/);
  assert.match(remaining, /createBrowserSession\(/);
  assert.match(remaining, /runPreparedEstamaDiaryOnPage\(input, connected\.page\)/);
  assert.match(remaining, /releaseSession\(/);
});

test("Free browser smoke test cannot publish or consume credentials", () => {
  const smoke = readFileSync(new URL("../scripts/estama-direct-chromium-smoke.mjs", import.meta.url), "utf8");
  assert.match(smoke, /chromium\.launch\(/);
  assert.match(smoke, /https:\/\/estama\.jp\/tamathera\/login\//);
  assert.doesNotMatch(smoke, /\.click\(|\.fill\(|\.press\(|\.submit\(|ESTAMA_.*PASSWORD|BROWSERBASE_API_KEY/);
});
