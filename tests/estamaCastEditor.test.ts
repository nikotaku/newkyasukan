import assert from "node:assert/strict";
import test from "node:test";

import {
  estamaAdminCastLinks,
  estamaCastEditLinks,
  estamaCastEditUrlCandidates,
  estamaCastIdFromUrl,
  estamaNameMatches,
  estamaSyncFields,
  findEstamaCastIdByName,
} from "../server/estama-cast-editor.ts";

test("既存のセラピストは新規登録の画面（/admin/cast_edit/）ではなく、IDの編集画面を開く", () => {
  const urls = estamaCastEditUrlCandidates("928853", "https://estama.jp/admin/cast_edit/");
  assert.ok(urls.length > 0);
  assert.ok(!urls.includes("https://estama.jp/admin/cast_edit/"));
  assert.equal(urls[0], "https://estama.jp/admin/cast_edit/928853/");
  assert.ok(urls.every((url) => url.includes("928853")));
  // 前に開けた編集画面のURLがそのセラピストのものなら最初に試す
  assert.equal(estamaCastEditUrlCandidates("928853", "https://estama.jp/admin/cast_edit/?cast_id=928853")[0],
    "https://estama.jp/admin/cast_edit/?cast_id=928853");
  // 別の人のURLは使わない
  assert.ok(!estamaCastEditUrlCandidates("928853", "https://estama.jp/admin/cast_edit/?cast_id=111111")
    .some((url) => url.includes("111111")));
  assert.deepEqual(estamaCastEditUrlCandidates(null), []);
  assert.deepEqual(estamaCastEditUrlCandidates(""), []);
});

test("URLからエステ魂のセラピストIDを取り出す", () => {
  assert.equal(estamaCastIdFromUrl("https://estama.jp/shop/51445/cast/968450/"), "968450");
  assert.equal(estamaCastIdFromUrl("https://estama.jp/admin/cast_edit/952399/"), "952399");
  assert.equal(estamaCastIdFromUrl("https://estama.jp/admin/cast_edit/?cast_id=952399"), "952399");
  assert.equal(estamaCastIdFromUrl("https://estama.jp/admin/cast_edit/"), null);
  assert.equal(estamaCastIdFromUrl(null), null);
});

test("名前の照合は空白・全角半角の違いを見ない", () => {
  assert.ok(estamaNameMatches("一ノ瀬 ひなた", ["一ノ瀬ひなた"]));
  assert.ok(estamaNameMatches("蛯原ゆき🔰", [null, "蛯原ゆき🔰"]));
  assert.ok(!estamaNameMatches("", ["一ノ瀬ひなた"]));
  assert.ok(!estamaNameMatches("萩原ゆの", ["一ノ瀬ひなた"]));
});

test("管理画面のリンクから、そのセラピストの編集画面を探す（出勤表・日記は除く）", () => {
  const links = [
    { href: "https://estama.jp/admin/schedule/928853/", text: "出勤" },
    { href: "https://estama.jp/admin/cast_edit/?cast_id=928853", text: "編集" },
    { href: "https://estama.jp/admin/cast_edit/?cast_id=929050", text: "編集" },
    { href: "https://estama.jp/shop/51445/cast/928853/", text: "公開ページ" },
  ];
  assert.deepEqual(estamaCastEditLinks(links, "928853"), ["https://estama.jp/admin/cast_edit/?cast_id=928853"]);
});

test("在籍一覧に同じ名前が1人だけいればそのIDを使う（二重登録しない）", () => {
  const links = [
    { href: "https://estama.jp/shop/51445/cast/968450/", text: "栗山みく (22)" },
    { href: "https://estama.jp/shop/51445/cast/952399/", text: "NEW 蛯原ゆき🔰" },
    { href: "https://estama.jp/shop/99999/cast/123456/", text: "栗山みく" },
    { href: "https://estama.jp/shop/51445/cast/968450/#review", text: "口コミ" },
  ];
  assert.equal(findEstamaCastIdByName(links, "51445", ["栗山みく"]), "968450");
  assert.equal(findEstamaCastIdByName(links, "51445", ["蛯原ゆき🔰"]), "952399");
  assert.equal(findEstamaCastIdByName(links, "51445", ["長谷川れい"]), null);
  // 同じ名前が2人いれば決めない
  const twice = [...links, { href: "https://estama.jp/shop/51445/cast/970000/", text: "栗山みく" }];
  assert.equal(findEstamaCastIdByName(twice, "51445", ["栗山みく"]), null);
});

test("PC版の在籍一覧（リンクは「VIEW DETAIL」、名前はカードの見出し）でも名前からIDを引く", () => {
  const links = [
    { href: "https://estama.jp/shop/51445/cast/969557/", text: "VIEW DETAIL", context: "葵みずき(26) T.154 B.86(D) VIEW DETAIL 葵みずき" },
    { href: "https://estama.jp/shop/51445/cast/968450/", text: "VIEW DETAIL", context: "栗山みく(32) T.156 B.84(C) VIEW DETAIL 栗山みく" },
    // 複数の人が入ったまとまりの文字は使わない（context は空）
    { href: "https://estama.jp/shop/51445/cast/971160/", text: "VIEW DETAIL", context: "" },
  ];
  assert.equal(findEstamaCastIdByName(links, "51445", ["栗山みく"]), "968450");
  assert.equal(findEstamaCastIdByName(links, "51445", ["伊藤れな🔰"]), null);
  // リンクの文字で決まるときは、まわりの文字より優先する
  const withText = [...links, { href: "https://estama.jp/shop/51445/cast/968450/#CastProfile", text: "栗山みく(32)", context: "栗山みく 葵みずき" }];
  assert.equal(findEstamaCastIdByName(withText, "51445", ["栗山みく"]), "968450");
});

test("管理画面のセラピストへのリンクを結果に残す", () => {
  const rows = estamaAdminCastLinks([
    { href: "https://estama.jp/admin/schedule/928853/", text: "一ノ瀬ひなた" },
    { href: "https://estama.jp/admin/schedule/928853/", text: "一ノ瀬ひなた" },
    { href: "https://estama.jp/admin/cast_edit/?cast_id=972001", text: "一ノ瀬ひなた" },
    { href: "https://estama.jp/admin/", text: "トップ" },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["928853", "972001"]);
});

test("payload.fields = sns ならブログ・SNS欄だけを直す", () => {
  assert.equal(estamaSyncFields({ fields: "sns" }), "sns");
  assert.equal(estamaSyncFields({ source: "profile_update" }), "all");
  assert.equal(estamaSyncFields(null), "all");
});
