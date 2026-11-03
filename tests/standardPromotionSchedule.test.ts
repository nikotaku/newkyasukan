import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { promotionTaskKind } from "../src/lib/promotionTaskDraft.ts";
import {
  buildStandardPromotionSchedule,
  type GeneratedPromotionSchedule,
  type PromotionChannelKey,
} from "../src/lib/standardPromotionSchedule.ts";

type Input = Parameters<typeof buildStandardPromotionSchedule>[0];
const CHANNELS: Array<{ key: PromotionChannelKey; label: string }> = [
  { key: "hp_top_banner", label: "HPトップバナー" },
  { key: "estama_top_banner", label: "エステ魂トップバナー" },
  { key: "x_post", label: "X投稿" },
  { key: "o2_post", label: "02投稿" },
  { key: "o2_story", label: "02ストーリー" },
  { key: "line_official", label: "LINE公式アカウントでの宣伝" },
];
const makeInput = (overrides: Partial<Input> = {}): Input => ({
  therapistNames: ["ひなた"],
  startsOn: "2026-11-01",
  endsOn: "2026-11-06",
  channels: CHANNELS.map((channel) => ({ ...channel, count: 1, sizeSpec: "" })),
  ...overrides,
});
const itemsOf = (schedule: GeneratedPromotionSchedule) => schedule.posting.flatMap((group) => group.items);
const datesFor = (schedule: GeneratedPromotionSchedule, key: PromotionChannelKey) =>
  schedule.posting.flatMap((group) => group.items.filter((item) => item.channel_key === key).map(() => group.scheduled_on));

function assertSchedule(input: Input, schedule = buildStandardPromotionSchedule(input)) {
  assert.equal(typeof schedule.title, "string");
  assert.ok(schedule.title.length > 0 && schedule.title.length <= 80);
  assert.match(schedule.description, /標準スケジュール（AI未使用）/);
  assert.equal(schedule.preparation.length, 6);
  assert.ok(schedule.preparation.every((item) => typeof item.label === "string" && item.label.length > 0));
  const dates = schedule.posting.map((group) => group.scheduled_on);
  assert.deepEqual(dates, [...new Set(dates)].sort());
  assert.ok(schedule.posting.length > 0);
  for (const group of schedule.posting) {
    assert.match(group.scheduled_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(group.scheduled_on >= input.startsOn && group.scheduled_on <= input.endsOn);
    assert.ok(group.group_label.length > 0);
    assert.ok(group.items.length > 0);
    for (const item of group.items) {
      assert.ok(item.label.length > 0 && item.label.length <= 260, item.label);
      const canonical = CHANNELS.find((channel) => channel.key === item.channel_key);
      assert.ok(canonical);
      assert.ok(item.label.startsWith(`${canonical.label}：`));
    }
  }
  assert.equal(itemsOf(schedule).length, input.channels.reduce((sum, channel) => sum + channel.count, 0));
  for (const channel of input.channels) {
    assert.equal(datesFor(schedule, channel.key).length, channel.count);
  }
}

test("default six channels produce compatible Japanese output and stagger single placements", () => {
  const input = makeInput();
  const schedule = buildStandardPromotionSchedule(input);
  assertSchedule(input, schedule);
  assert.equal(schedule.title, "ひなたの標準宣伝スケジュール");
  assert.deepEqual(schedule.posting.map((group) => group.scheduled_on), [
    "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06",
  ]);
  assert.deepEqual(itemsOf(schedule).map((item) => item.channel_key), CHANNELS.map((channel) => channel.key));
  assert.ok(itemsOf(schedule).every((item) => item.label.includes("ひなた") && item.label.includes("1/1回目")));
  assert.match(schedule.posting[0].group_label, /ティザー/);
  assert.match(schedule.posting[2].group_label, /中盤/);
  assert.match(schedule.posting.at(-1)!.group_label, /最終/);
});

test("six fixed preparation tasks retain video, photo, banner quantities and three news drafts", () => {
  const single = buildStandardPromotionSchedule(makeInput()).preparation.map((item) => item.label);
  assert.deepEqual(single, [
    "ショート動画 3本（各5秒／ティザー・中盤・最終で使い分け）",
    "告知用宣材写真 3パターン（ティザー・中盤・最終で分散使用）",
    "告知バナー 1点（横長／X・エステ魂ヘッダー想定）",
    "ニュース① 原稿（ティザー・初回告知用）",
    "ニュース② 原稿（中盤・魅力紹介用）",
    "ニュース③ 原稿（最終・予約案内用）",
  ]);
  const multi = buildStandardPromotionSchedule(makeInput({ therapistNames: ["ひなた", "りな"] }));
  assert.match(multi.preparation[1].label, /^2ショット宣材写真 3パターン/);
  assert.deepEqual(multi.preparation.filter((_, index) => index !== 1).map((item) => item.label),
    single.filter((_, index) => index !== 1));
});

test("multiple names, short specifications and a goal are retained without claiming analysis", () => {
  const input = makeInput({
    therapistNames: [" ひなた ", "りな"],
    goal: "  新人の紹介と予約案内を重視  ",
  });
  input.channels = input.channels.map((channel) => ({ ...channel, sizeSpec: "1080×1920・縦長" }));
  const schedule = buildStandardPromotionSchedule(input);
  assertSchedule(input, schedule);
  assert.ok(schedule.title.includes("ひなた・りな"));
  assert.ok(itemsOf(schedule).every((item) => item.label.includes("ひなた・りな") && item.label.includes("1080×1920・縦長")));
  assert.ok(schedule.description.endsWith("目標メモ：新人の紹介と予約案内を重視"));
  assert.doesNotMatch(schedule.description, /分析|最適化/);
});

test("long names, goal and specifications are bounded without broken surrogate pairs", () => {
  const input = makeInput({
    therapistNames: ["ひなた😀".repeat(30), "りな".repeat(40), "さくら".repeat(40), "あおい", "はる"],
    goal: "😀".repeat(600),
    channels: CHANNELS.map((channel) => ({ ...channel, count: 30, sizeSpec: "😀縦長仕様".repeat(100) })).slice(0, 3),
  });
  const schedule = buildStandardPromotionSchedule(input);
  assertSchedule(input, schedule);
  assert.match(schedule.title, /ほか2名/);
  assert.ok(schedule.description.split("目標メモ：")[1].length <= 500);
  for (const value of [schedule.title, schedule.description, ...itemsOf(schedule).map((item) => item.label)]) {
    assert.equal(value.isWellFormed(), true);
  }
  assert.ok(itemsOf(schedule).every((item) => item.label.includes("仕様：") && item.label.includes("…")));
});

test("all six channels retain the full 120-character specification even with long names", () => {
  const sizeSpec = "横1200px・縦600px・余白40px・文字中央・".repeat(6).slice(0, 120);
  assert.equal(sizeSpec.length, 120);
  const input = makeInput({
    therapistNames: ["ひなた".repeat(30), "りな".repeat(30), "さくら".repeat(30)],
    channels: CHANNELS.map((channel) => ({ ...channel, count: 1, sizeSpec })),
  });
  const schedule = buildStandardPromotionSchedule(input);
  assertSchedule(input, schedule);
  for (const item of itemsOf(schedule)) {
    assert.ok(item.label.endsWith(`／仕様：${sizeSpec}`), item.label);
    assert.equal(item.label.split("／仕様：")[1], sizeSpec);
  }
});

test("blank goal/specification are omitted and channel labels stay canonical", () => {
  const input = makeInput({ goal: " \n\t " });
  input.channels = input.channels.map((channel) => ({ ...channel, label: "別名X O2 ニュース", sizeSpec: " \n " }));
  const schedule = buildStandardPromotionSchedule(input);
  assertSchedule(input, schedule);
  assert.doesNotMatch(schedule.description, /目標メモ/);
  assert.ok(itemsOf(schedule).every((item) => !item.label.includes("仕様：") && !item.label.includes("別名")));
});

test("channel classifier uses the canonical prefix even when names contain X/O2", () => {
  const schedule = buildStandardPromotionSchedule(makeInput({ therapistNames: ["X O2 ひなた"] }));
  assert.deepEqual(itemsOf(schedule).map((item) => promotionTaskKind(item.label, item.channel_key)), [
    "manual", "manual", "store_x", "self_o2", "o2_story", "manual",
  ]);
  for (const item of itemsOf(schedule).filter((item) => item.channel_key.endsWith("banner"))) {
    assert.match(item.label, /告知バナー/);
  }
});

test("every channel count 1–30 is exact and evenly spread for 1, 2, 7 and 60 day periods", () => {
  const start = Date.parse("2026-01-01T00:00:00Z");
  for (const days of [1, 2, 7, 60]) {
    const endsOn = new Date(start + (days - 1) * 86_400_000).toISOString().slice(0, 10);
    for (const channel of CHANNELS) {
      for (let count = 1; count <= 30; count += 1) {
        const input = makeInput({
          startsOn: "2026-01-01", endsOn,
          channels: [{ ...channel, count, sizeSpec: "1200×600" }],
        });
        const schedule = buildStandardPromotionSchedule(input);
        assertSchedule(input, schedule);
        const dates = datesFor(schedule, channel.key);
        assert.equal(dates[0], input.startsOn);
        if (count > 1) assert.equal(dates.at(-1), endsOn);
        const offsets = dates.map((date) => (Date.parse(`${date}T00:00:00Z`) - start) / 86_400_000);
        assert.deepEqual(offsets, Array.from({ length: count }, (_, index) =>
          count === 1 ? 0 : Math.round(index * (days - 1) / (count - 1))));
        const gaps = offsets.slice(1).map((offset, index) => offset - offsets[index]);
        if (gaps.length) assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1);
        assert.deepEqual(itemsOf(schedule).map((item) => item.label.match(/(\d+)\/\d+回目/)![1]),
          Array.from({ length: count }, (_, index) => String(index + 1)));
      }
    }
  }
});

test("mixed counts and out-of-order channels create one ascending group per date", () => {
  const input = makeInput({
    channels: [
      { ...CHANNELS[4], count: 1, sizeSpec: "" },
      { ...CHANNELS[2], count: 7, sizeSpec: "" },
      { ...CHANNELS[0], count: 2, sizeSpec: "" },
      { ...CHANNELS[5], count: 1, sizeSpec: "" },
    ],
  });
  const schedule = buildStandardPromotionSchedule(input);
  assertSchedule(input, schedule);
  assert.equal(datesFor(schedule, "o2_story")[0], input.startsOn);
  assert.equal(datesFor(schedule, "line_official")[0], input.endsOn);
});

test("100 same-day placements are preserved, including repeated channel/date pairs", () => {
  const counts = [30, 30, 30, 8, 1, 1];
  const input = makeInput({ endsOn: "2026-11-01" });
  input.channels = input.channels.map((channel, index) => ({ ...channel, count: counts[index] }));
  const schedule = buildStandardPromotionSchedule(input);
  assertSchedule(input, schedule);
  assert.equal(schedule.posting.length, 1);
  assert.equal(schedule.posting[0].items.length, 100);
  assert.match(schedule.posting[0].group_label, /当日集中告知/);
  assert.equal(new Set(itemsOf(schedule).map((item) => `${item.channel_key}:${item.label}`)).size, 100);
  assert.ok(itemsOf(schedule).some((item) => item.label.includes("ティザー素材")));
  assert.ok(itemsOf(schedule).some((item) => item.label.includes("中盤素材")));
  assert.ok(itemsOf(schedule).some((item) => item.label.includes("最終素材")));
});

test("100 placements also work across the inclusive 60-day boundary", () => {
  const input = makeInput({ startsOn: "2026-01-01", endsOn: "2026-03-01" });
  input.channels = input.channels.map((channel, index) => ({ ...channel, count: [30, 30, 30, 8, 1, 1][index] }));
  const schedule = buildStandardPromotionSchedule(input);
  assertSchedule(input, schedule);
  assert.equal(schedule.posting[0].scheduled_on, input.startsOn);
  assert.equal(schedule.posting.at(-1)!.scheduled_on, input.endsOn);
});

test("three placements use teaser, middle and final materials and matching themes", () => {
  const input = makeInput({
    startsOn: "2026-11-01", endsOn: "2026-11-09",
    channels: [{ ...CHANNELS[2], count: 3, sizeSpec: "" }],
  });
  const schedule = buildStandardPromotionSchedule(input);
  assert.deepEqual(schedule.posting.map((group) => group.scheduled_on), ["2026-11-01", "2026-11-05", "2026-11-09"]);
  for (const [index, phase] of ["ティザー", "中盤", "最終"].entries()) {
    assert.ok(schedule.posting[index].group_label.includes(phase));
    assert.ok(schedule.posting[index].items[0].label.includes(`${phase}素材`));
    assert.ok(schedule.posting[index].items[0].label.includes(["ニュース①", "ニュース②", "ニュース③"][index]));
  }
});

test("real leap dates, early years, year boundaries and the last four-digit year are valid", () => {
  for (const [startsOn, endsOn] of [
    ["2028-02-28", "2028-03-01"],
    ["2000-02-29", "2000-02-29"],
    ["0001-01-01", "0001-01-01"],
    ["0099-12-31", "0100-01-01"],
    ["2026-12-31", "2027-01-01"],
    ["9999-12-31", "9999-12-31"],
  ]) {
    assertSchedule(makeInput({ startsOn, endsOn }));
  }
  const leap = buildStandardPromotionSchedule(makeInput({
    startsOn: "2028-02-28", endsOn: "2028-03-01",
    channels: [{ ...CHANNELS[2], count: 3, sizeSpec: "" }],
  }));
  assert.deepEqual(leap.posting.map((group) => group.scheduled_on), ["2028-02-28", "2028-02-29", "2028-03-01"]);
});

test("strict date validation rejects impossible dates, non-padded dates and timezone/time suffixes", () => {
  const invalidDates: unknown[] = [
    "", "2026-02-29", "1900-02-29", "2028-02-30", "2026-04-31", "2026-11-31",
    "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32", "0000-01-01", "10000-01-01",
    "2026-1-01", "2026-01-1", "26-01-01", "2026/01/01", " 2026-01-01", "2026-01-01 ",
    "2026-01-01\n", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00+09:00", "2026-01-01Z",
    null, undefined, 20260101,
  ];
  for (const value of invalidDates) {
    for (const field of ["startsOn", "endsOn"] as const) {
      assert.throws(() => buildStandardPromotionSchedule(makeInput({ [field]: value } as Partial<Input>)), /有効なYYYY-MM-DD/);
    }
  }
});

test("reversed periods and 61 inclusive days are rejected", () => {
  assert.throws(() => buildStandardPromotionSchedule(makeInput({ startsOn: "2026-11-02", endsOn: "2026-11-01" })), /開始日以降/);
  assert.throws(() => buildStandardPromotionSchedule(makeInput({ startsOn: "2026-01-01", endsOn: "2026-03-02" })), /60日以内/);
});

test("invalid or empty name lists and empty enabled channel lists are rejected independently", () => {
  for (const names of [[], [""], [" \t\n"], ["ひなた", ""], [null], Array(1), null, "ひなた"]) {
    assert.throws(() => buildStandardPromotionSchedule(makeInput({ therapistNames: names } as unknown as Partial<Input>)), /セラピスト名/);
  }
  for (const channels of [[], null, {}]) {
    assert.throws(() => buildStandardPromotionSchedule(makeInput({ channels } as unknown as Partial<Input>)), /宣伝先/);
  }
  assert.throws(() => buildStandardPromotionSchedule(null as unknown as Input), /セラピスト名/);
});

test("noninteger counts, count limits, duplicates, unsupported keys and totals over 100 are rejected", () => {
  for (const count of [0, -1, 31, 1.5, NaN, Infinity, "1", null, undefined]) {
    const channels = [{ ...CHANNELS[0], count, sizeSpec: "" }];
    assert.throws(() => buildStandardPromotionSchedule(makeInput({ channels } as unknown as Partial<Input>)), /1〜30の整数/);
  }
  const duplicate = makeInput();
  duplicate.channels[1] = { ...duplicate.channels[0] };
  assert.throws(() => buildStandardPromotionSchedule(duplicate), /重複/);
  for (const key of ["unsupported", "HP_top_banner", "toString", "__proto__", "constructor", "", null]) {
    assert.throws(() => buildStandardPromotionSchedule(makeInput({
      channels: [{ key, label: "任意", count: 1, sizeSpec: "" }],
    } as unknown as Partial<Input>)), /未対応/);
  }
  const overLimit = makeInput();
  overLimit.channels = overLimit.channels.map((channel, index) => ({ ...channel, count: [30, 30, 30, 9, 1, 1][index] }));
  assert.throws(() => buildStandardPromotionSchedule(overLimit), /合計は100以内/);
});

test("malformed runtime channel fields and nonstring goal fail safely", () => {
  for (const channel of [null, { ...CHANNELS[0], count: 1, sizeSpec: null }, { ...CHANNELS[0], count: 1, sizeSpec: "", label: 10 }]) {
    assert.throws(() => buildStandardPromotionSchedule(makeInput({ channels: [channel] } as unknown as Partial<Input>)), Error);
  }
  assert.throws(() => buildStandardPromotionSchedule(makeInput({ goal: 10 } as unknown as Partial<Input>)), /目標メモは文字列/);
});

test("output is deterministic, input is immutable, and separate outputs do not share mutable objects", () => {
  const input = makeInput({ therapistNames: [" ひなた ", "りな"], goal: " メモ " });
  const original = structuredClone(input);
  input.channels.forEach(Object.freeze);
  Object.freeze(input.channels);
  Object.freeze(input.therapistNames);
  Object.freeze(input);
  const first = buildStandardPromotionSchedule(input);
  const second = buildStandardPromotionSchedule(input);
  assert.deepEqual(input, original);
  assert.deepEqual(first, second);
  first.preparation[0].label = "changed";
  first.posting[0].items[0].label = "changed";
  first.posting[0].group_label = "changed";
  assert.deepEqual(second, buildStandardPromotionSchedule(input));
});

test("UTC schedule is identical across host timezones including DST transitions", () => {
  const moduleUrl = new URL("../src/lib/standardPromotionSchedule.ts", import.meta.url).href;
  for (const [startsOn, endsOn] of [["2026-03-07", "2026-03-10"], ["2026-10-31", "2026-11-03"]]) {
    const input = makeInput({ startsOn, endsOn });
    input.channels = input.channels.map((channel) => ({ ...channel, count: 4 }));
    const expected = buildStandardPromotionSchedule(input);
    for (const timezone of ["UTC", "Asia/Tokyo", "America/New_York", "Europe/Berlin", "Pacific/Honolulu"]) {
      const script = `import { buildStandardPromotionSchedule } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(buildStandardPromotionSchedule(${JSON.stringify(input)})));`;
      const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
        encoding: "utf8", env: { ...process.env, TZ: timezone }, timeout: 10_000,
      });
      assert.equal(result.status, 0, `${timezone}: ${result.stderr}`);
      assert.deepEqual(JSON.parse(result.stdout), expected, timezone);
    }
  }
});
