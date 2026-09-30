import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesPreferredArea,
  parseAgeGender,
  selectScoutCandidates,
  type ScoutListEntry,
} from "../src/lib/estamaScout.ts";

const entry = (id: string, patch: Partial<ScoutListEntry> = {}): ScoutListEntry => ({
  externalId: id,
  name: "匿名希望",
  age: "30",
  gender: "女",
  areas: "梅田,日本橋(大阪)",
  section: "新着",
  scouted: false,
  summary: "",
  ...patch,
});

const AREAS = ["仙台", "宮城", "東北"];

test("年齢と性別を読む", () => {
  assert.deepEqual(parseAgeGender("(26歳 女)"), { age: "26", gender: "女" });
  assert.deepEqual(parseAgeGender("（４３歳　女）"), { age: "43", gender: "女" });
  assert.deepEqual(parseAgeGender("(38歳 男)"), { age: "38", gender: "男" });
  assert.deepEqual(parseAgeGender("匿名希望"), { age: "", gender: "" });
});

test("優先エリアに当たるか", () => {
  assert.equal(matchesPreferredArea("仙台,山形", AREAS), true);
  assert.equal(matchesPreferredArea("宮城", AREAS), true);
  assert.equal(matchesPreferredArea("梅田,日本橋(大阪)", AREAS), false);
  assert.equal(matchesPreferredArea("", AREAS), false);
  assert.equal(matchesPreferredArea("仙台", []), false);
});

test("スカウト済み・以前に送った人・男性・同じ人は選ばない", () => {
  const picked = selectScoutCandidates([
    entry("1", { scouted: true }),
    entry("2"),
    entry("2"),
    entry("3", { gender: "男" }),
    entry("4"),
    entry("5"),
  ], { count: 10, excludedIds: ["4"], preferredAreas: AREAS, onlyPreferred: false });
  assert.deepEqual(picked.map((item) => item.externalId), ["2", "5"]);
});

test("優先エリアの人を先に、人数で切る", () => {
  const picked = selectScoutCandidates([
    entry("1"),
    entry("2", { areas: "仙台" }),
    entry("3"),
    entry("4", { areas: "宮城,山形" }),
  ], { count: 3, excludedIds: [], preferredAreas: AREAS, onlyPreferred: false });
  assert.deepEqual(picked.map((item) => [item.externalId, item.preferred]), [["2", true], ["4", true], ["1", false]]);
});

test("優先エリアだけにする設定", () => {
  const picked = selectScoutCandidates([
    entry("1"),
    entry("2", { areas: "東北" }),
  ], { count: 10, excludedIds: new Set<string>(), preferredAreas: AREAS, onlyPreferred: true });
  assert.deepEqual(picked.map((item) => item.externalId), ["2"]);
});

test("人数0なら誰も選ばない", () => {
  assert.equal(selectScoutCandidates([entry("1")], { count: 0, excludedIds: [], preferredAreas: AREAS, onlyPreferred: false }).length, 0);
});
