import { test } from "node:test";
import assert from "node:assert/strict";
import { castNameFromLabel, normalizeCastName, parseEstamaContractUntil, parseEstamaReservations } from "../server/estama-reserve-parse.ts";

// 画面の文字の形だけを再現した架空のデータ（実在のお客様の情報は書かない）
const page = `お店への予約 予約を検索 1 〜 20 件を表示 全141件
2026年10月12日11時24分 受付 予約の希望 日時 10/12 (月) 13:00 指名 フリー(指名なし) コース 【会員限定】70分お試しプラン(70分) 20,000 円 オプション ー 指名料 ー 合計金額 20,000 円 ※合計金額は、クーポン適用前の料金となります。 クーポン 新規割 ご新規様1000円オフ ご要望 ー リピート予約 エステ魂会員 山田 太郎 連絡先 09000000001 taro@example.com ブラックリストの内容を 確認・登録 MEMO 例:電話で予約確定済み メモを作成
2026年10月11日21時44分 受付 予約の希望 日時 10/13 (火) 01:30 指名 さくら🔰(26) コース 艶華コース(80分) 19,000 円 オプション アロマ 指名料 1,000 円 ※本指名の場合は 2,000 円 合計金額 20,000 円 ※合計金額は、クーポン適用前の料金となります。 クーポン ー ご要望 ショートメッセージで連絡ください。 新規予約 未認証 鈴木一郎 連絡先 080-0000-0002 ブラックリストの内容を 確認・登録 MEMO
2026年12月30日20時00分 受付 予約の希望 日時 1/2 (土) 15:00 指名 りりか&ももか(22) コース 艶華コース(120分) 30,000 円 オプション ー 指名料 2,000 円 合計金額 32,000 円 クーポン ー ご要望 ー 新規予約 エステ魂会員 佐藤 連絡先 09000000003 ブラックリスト`;

test("仮予約を1件ずつ取り出す", () => {
  const items = parseEstamaReservations(page);
  assert.equal(items.length, 3);
  const [free, named, nextYear] = items;

  assert.equal(free.isFree, true);
  assert.equal(free.castName, null);
  assert.equal(free.hopeDate, "2026-10-12");
  assert.equal(free.hopeTime, "13:00");
  assert.equal(free.courseLabel, "【会員限定】70分お試しプラン");
  assert.equal(free.courseMinutes, 70);
  assert.equal(free.coursePrice, 20000);
  assert.equal(free.nominationFee, null);
  assert.equal(free.coupon, "新規割 ご新規様1000円オフ");
  assert.equal(free.requestNote, null);
  assert.equal(free.visitKind, "リピート予約");
  assert.equal(free.memberLabel, "エステ魂会員");
  assert.equal(free.customerName, "山田 太郎");
  assert.equal(free.customerPhone, "09000000001");
  assert.equal(free.customerEmail, "taro@example.com");
  assert.equal(free.receivedAt, "2026-10-12T11:24:00+09:00");

  assert.equal(named.castName, "さくら");
  assert.equal(named.hopeDate, "2026-10-13");
  assert.equal(named.hopeTime, "01:30");
  assert.equal(named.nominationFee, 1000);
  assert.equal(named.totalPrice, 20000);
  assert.equal(named.coupon, null);
  assert.equal(named.requestNote, "ショートメッセージで連絡ください。");
  assert.equal(named.memberLabel, "未認証");
  assert.equal(named.customerName, "鈴木一郎");
  assert.equal(named.customerPhone, "08000000002");
  assert.equal(named.customerEmail, null);

  assert.equal(nextYear.hopeDate, "2027-01-02");
  assert.equal(nextYear.castName, "りりか&ももか");
  assert.notEqual(free.externalKey, named.externalKey);
});

test("名前の照合", () => {
  assert.equal(castNameFromLabel("伊藤れな🔰(26)"), "伊藤れな");
  assert.equal(normalizeCastName("伊藤 れな🔰"), normalizeCastName("伊藤れな(26)"));
});

test("管理画面の契約期間を読む（サブスクの見張り）", () => {
  assert.equal(parseEstamaContractUntil("艶華 (店舗番号:00000) (ご契約期間:2026年10月24日 15:32 まで) プラチナプラン"), "2026-10-24T06:32:00.000Z");
  assert.equal(parseEstamaContractUntil("ご契約期間：2027年1月5日まで"), "2027-01-05T14:59:00.000Z");
  assert.equal(parseEstamaContractUntil("契約の表示なし"), null);
});
