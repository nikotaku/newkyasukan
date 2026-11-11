import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("../src/lib/estamaProfileData.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../server/estama-profile-data.ts", import.meta.url), "utf8");
const automation = readFileSync(new URL("../server/estama-automation.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../api/automations/estama-portal-worker.ts", import.meta.url), "utf8");

test("server and browser Estama profile mapping stay identical", () => {
  const serverWithoutHeader = server.replace(/^\/\/ Server-side mirror[^\n]*\n\/\/ The runtime[^\n]*\n\/\/ Keep both[^\n]*\n/, "");
  const normalized = serverWithoutHeader.replace('from "./estama-sns-links.js"', 'from "../../server/estama-sns-links.ts"');
  assert.equal(normalized, src);
});

test("Vercel Estama worker never imports unbundled src TypeScript files", () => {
  assert.match(automation, /from "\.\/estama-profile-data\.js"/);
  assert.doesNotMatch(automation, /from ["']\.\.\/src\/lib\//);
  assert.match(server, /from "\.\/estama-sns-links\.js"/);
  assert.doesNotMatch(worker, /from ["']\.\.\/\.\.\/src\//);
});

test("Estama worker offers a safe, non-publishing GET startup probe", () => {
  assert.match(worker, /if \(req\.method !== "POST"\)/);
  assert.match(worker, /res\.status\(405\)/);
});
