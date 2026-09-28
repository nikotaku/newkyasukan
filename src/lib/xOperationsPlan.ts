/**
 * X運用表：集客・求人・店長の3アカウント分の「1日の投稿スケジュール」「曜日別テーマ」「毎日のルーティン」。
 * 保存先は site_content（key = x_ops_plan）に JSON で丸ごと入れる。
 */

export interface XDailyRow {
  time: string;
  type: string;
  content: string;
  example: string;
  material: string;
  goal: string;
}

export interface XWeeklyRow {
  day: string;
  theme: string;
  detail: string;
}

export interface XRoutineRow {
  timing: string;
  task: string;
  note: string;
}

export interface XAccountPlan {
  key: string;
  name: string;
  handle: string;
  purpose: string;
  kpi: string;
  target: string;
  tone: string;
  daily: XDailyRow[];
  weekly: XWeeklyRow[];
  routines: XRoutineRow[];
}

export interface XOperationsPlan {
  version: 1;
  accounts: XAccountPlan[];
  rules: string[];
}

export const X_OPS_CONTENT_KEY = "x_ops_plan";

export const DEFAULT_X_OPERATIONS_PLAN: XOperationsPlan = {
  version: 1,
  accounts: [
    {
      key: "shukyaku",
      name: "集客アカウント",
      handle: "",
      purpose: "予約を取る。「今日・今から行ける」を毎日伝えて予約ページへ送る",
      kpi: "予約ページクリック数／X経由の予約件数／インプレッション",
      target: "仙台でメンエスを探している男性（当日・直前で探す人が中心）",
      tone: "丁寧・わかりやすい。空き状況と料金は必ず数字で",
      daily: [
        { time: "10:00", type: "本日の出勤", content: "本日の出勤セラピスト一覧と受付時間", example: "【本日の出勤】\n◯◯（12時〜）\n△△（15時〜）\nご予約はこちら▶︎予約URL", material: "出勤表画像（スケジュールから作成）", goal: "当日予約" },
        { time: "12:00", type: "セラピスト紹介", content: "1名をピックアップ。写メ日記・本人投稿を引用RP", example: "本日出勤の◯◯さん🌙\n丁寧なリンパと会話の上手さで指名多数。\n本日15時〜ご案内可能です", material: "パネル写真／写メ日記", goal: "指名予約" },
        { time: "15:00", type: "空き枠速報", content: "今日の残り枠を時間つきで", example: "【空き枠速報】\n本日18:00〜 残り1枠\n21:00〜 残り2枠\nお早めに▶︎予約URL", material: "テキストのみでOK", goal: "当日予約" },
        { time: "18:00", type: "イベント・割引", content: "開催中のイベント・クーポンを告知（ゴールデンタイム前）", example: "今週末限定🎁\n90分以上で◯分延長無料\n合言葉「X見た」でご予約ください", material: "イベントバナー", goal: "予約単価アップ" },
        { time: "21:00", type: "直前枠・口コミ", content: "ラスト枠の告知 or お客様の口コミ紹介", example: "本日ラスト枠 23:00〜 1名様ご案内可能です\nお電話が一番早いです📞", material: "口コミスクショ（名前は隠す）", goal: "直前予約・信頼" },
        { time: "23:30", type: "明日の出勤予告", content: "明日の出勤一覧と事前予約の案内", example: "【明日の出勤】\n◯◯／△△／□□\n事前予約で確実にご案内できます", material: "出勤表画像", goal: "事前予約" },
      ],
      weekly: [
        { day: "月", theme: "新人・注目セラピスト", detail: "新人紹介・今週イチオシを12時枠で" },
        { day: "火", theme: "口コミ紹介", detail: "口コミを3件ピックアップ（21時枠）" },
        { day: "水", theme: "イベント告知", detail: "週末イベントを先出し（18時枠）" },
        { day: "木", theme: "セラピスト深掘り", detail: "得意な施術・人柄をQ&A形式で" },
        { day: "金", theme: "週末予約開放", detail: "土日の出勤を早めに告知し事前予約を取る" },
        { day: "土", theme: "当日速報を強化", detail: "空き枠速報を15時・19時・21時の3回に増やす" },
        { day: "日", theme: "翌週の出勤まとめ", detail: "翌週の出勤表を1枚画像で固定ポスト候補に" },
      ],
      routines: [
        { timing: "朝", task: "予約状況を確認して空き枠を把握", note: "スケジュール画面の空き枠を見る" },
        { timing: "昼", task: "セラピストの投稿をRP・いいね", note: "全員分。本人のやる気と露出の両方に効く" },
        { timing: "夕方", task: "#仙台メンエス を検索して反応", note: "いいね・リプで露出を増やす" },
        { timing: "月1回", task: "固定ポストを更新", note: "料金・予約方法・今月のイベントを1枚に" },
      ],
    },
    {
      key: "kyujin",
      name: "求人アカウント",
      handle: "",
      purpose: "セラピストの応募を取る。「稼げる・安心・続けやすい」を毎日見せる",
      kpi: "求人LPクリック数／応募・面接件数／フォロワー（女性比率）",
      target: "仙台・東北で働き先を探している女性（未経験・経験者・掛け持ち）",
      tone: "やさしく正直に。数字は実績ベース、盛らない",
      daily: [
        { time: "9:00", type: "給与実績", content: "昨日のバック実績・稼ぎ例を数字で", example: "【昨日の実績】\n出勤6時間で◯万◯千円\n日払いOK・全額その日にお渡しです", material: "テキスト or 簡単な図解", goal: "興味を持たせる" },
        { time: "13:00", type: "働く環境", content: "ルーム・待機環境・身バレ対策・衛生管理", example: "待機はこんな感じです☕️\n個室・Wi-Fi・ドリンク完備\n写真は顔出しなしでもOK", material: "ルーム・待機部屋の写真", goal: "不安を消す" },
        { time: "17:00", type: "在籍の声・Q&A", content: "在籍セラピストの声 or よくある質問に回答", example: "Q. 未経験でも大丈夫？\nA. 在籍の半分以上が未経験スタート。講習は店長が直接つきます", material: "Q&A画像テンプレ", goal: "応募のハードルを下げる" },
        { time: "22:00", type: "応募導線", content: "今週の面接枠と求人LPへの誘導", example: "今週の面接枠あと3名です\n体験入店もOK\n詳しくはこちら▶︎求人LP", material: "求人バナー", goal: "応募" },
      ],
      weekly: [
        { day: "月", theme: "給与の仕組み", detail: "バック率・指名料・日払いの流れ" },
        { day: "火", theme: "よくある質問", detail: "DMや面接で聞かれた質問に答える" },
        { day: "水", theme: "在籍セラピストの声", detail: "本人の了承を取ってコメント紹介" },
        { day: "木", theme: "講習・教育", detail: "講習の内容・マニュアルの一部を見せる" },
        { day: "金", theme: "週末の稼働実績", detail: "週末はどれくらい稼げるかを数字で" },
        { day: "土", theme: "未経験OK訴求", detail: "未経験スタートの人の実例" },
        { day: "日", theme: "今週のまとめ・面接枠", detail: "翌週の面接可能日を告知" },
      ],
      routines: [
        { timing: "朝", task: "前日の実績数字を確認", note: "9時の給与実績ポスト用" },
        { timing: "昼", task: "#メンエス求人 #仙台求人 を検索して反応", note: "いいね中心。DMの自動送信はしない（X規約違反）" },
        { timing: "夜", task: "届いたDMに手動で返信", note: "当日中に返す。LINE・求人LPへ誘導" },
        { timing: "週1回", task: "質問ネタを在籍セラピストから集める", note: "火曜のQ&A用" },
      ],
    },
    {
      key: "tencho",
      name: "店長アカウント",
      handle: "",
      purpose: "人柄と考え方を出してファンを作る。集客・求人アカウントへ送客する",
      kpi: "フォロワー数／プロフィールクリック／引用RPからの流入",
      target: "お客様・セラピスト候補・同業者",
      tone: "本音・人間味。一人称で、店の裏側を見せる",
      daily: [
        { time: "8:00", type: "朝のひとこと", content: "今日やること・意気込みを短く", example: "おはようございます。\n今日は新人講習2本。いい店にします。", material: "なしでOK", goal: "毎日見られる習慣を作る" },
        { time: "12:30", type: "店づくりの裏側", content: "備品購入・清掃・改善したこと", example: "タオルを全部ホテル仕様に変えました。\n肌ざわりで満足度は変わる、と信じてます", material: "現場の写真", goal: "信頼" },
        { time: "19:00", type: "考え方・本音", content: "接客の考え方・セラピストへの想い・業界の話", example: "セラピストが長く続けられる店が、結局お客様にも一番いい店だと思ってます", material: "テキストのみ", goal: "ファン化・求人" },
        { time: "23:00", type: "振り返り＋引用RP", content: "今日の感謝＋公式・求人アカウントの投稿を引用RP", example: "今日もご来店ありがとうございました。\n明日の出勤はこちら👇（公式を引用）", material: "公式・求人の投稿", goal: "送客" },
      ],
      weekly: [
        { day: "月", theme: "今週の目標", detail: "売上・採用・改善の目標を宣言" },
        { day: "火", theme: "お客様エピソード", detail: "個人が特定されない範囲で嬉しかった話" },
        { day: "水", theme: "セラピスト紹介", detail: "店長目線で1人を推す（公式へ送客）" },
        { day: "木", theme: "経営・業界の話", detail: "数字や考え方。同業者にも刺さる内容" },
        { day: "金", theme: "週末の呼びかけ", detail: "週末の空き状況を公式から引用RP" },
        { day: "土", theme: "裏側の動画", detail: "準備風景・ルーム紹介を短い動画で" },
        { day: "日", theme: "1週間の振り返り", detail: "できたこと・来週やること" },
      ],
      routines: [
        { timing: "毎日", task: "公式・求人の投稿を1本ずつ引用RP", note: "店長の言葉をひとこと添える" },
        { timing: "毎日", task: "リプライに返信", note: "店長アカウントは会話が一番の価値" },
        { timing: "週1回", task: "伸びた投稿を振り返る", note: "インプレ上位3件の共通点をメモ" },
      ],
    },
  ],
  rules: [
    "3アカウントの役割を混ぜない：集客＝予約、求人＝応募、店長＝人柄と送客",
    "投稿には必ず次の行動を1つだけ入れる（予約URL・求人LP・電話のどれか）",
    "時間はできるだけ固定する。同じ時間に出すとフォロワーが見る習慣ができる",
    "予約投稿を使って朝にまとめて作る（10分×3アカウント）",
    "DMの自動送信・フォロー自動化はしない（X規約違反で凍結リスク）",
    "過度な肌露出・誤解を招く表現は避ける（センシティブ判定・凍結対策）",
    "お客様・セラピストの個人が特定できる情報は出さない",
  ],
};

export const normalizeXOperationsPlan = (raw: unknown): XOperationsPlan => {
  if (!raw || typeof raw !== "object") return DEFAULT_X_OPERATIONS_PLAN;
  const p = raw as Partial<XOperationsPlan>;
  if (!Array.isArray(p.accounts) || p.accounts.length === 0) return DEFAULT_X_OPERATIONS_PLAN;
  return {
    version: 1,
    accounts: p.accounts.map((a) => ({
      key: a.key || Math.random().toString(36).slice(2, 8),
      name: a.name || "",
      handle: a.handle || "",
      purpose: a.purpose || "",
      kpi: a.kpi || "",
      target: a.target || "",
      tone: a.tone || "",
      daily: Array.isArray(a.daily) ? a.daily : [],
      weekly: Array.isArray(a.weekly) ? a.weekly : [],
      routines: Array.isArray(a.routines) ? a.routines : [],
    })),
    rules: Array.isArray(p.rules) ? p.rules : DEFAULT_X_OPERATIONS_PLAN.rules,
  };
};

const toMinutes = (t: string) => {
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9999;
};

/** 3アカウントの1日の投稿を時間順に1本にまとめる */
export const buildCombinedTimeline = (plan: XOperationsPlan) =>
  plan.accounts
    .flatMap((a) => a.daily.map((r) => ({ account: a.name, accountKey: a.key, ...r })))
    .sort((x, y) => toMinutes(x.time) - toMinutes(y.time));

const csvCell = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;

/** Excelでそのまま開けるCSV（BOM付き）。全アカウント・全シートを1ファイルに縦に並べる */
export const buildXOperationsCsv = (plan: XOperationsPlan) => {
  const lines: string[] = [];
  const row = (cells: string[]) => lines.push(cells.map(csvCell).join(","));

  row(["■ 1日の全体タイムライン"]);
  row(["時間", "アカウント", "投稿タイプ", "内容", "例文", "素材", "目的"]);
  buildCombinedTimeline(plan).forEach((r) => row([r.time, r.account, r.type, r.content, r.example, r.material, r.goal]));
  lines.push("");

  plan.accounts.forEach((a) => {
    row([`■ ${a.name}${a.handle ? `（${a.handle}）` : ""}`]);
    row(["目的", a.purpose]);
    row(["KPI", a.kpi]);
    row(["ターゲット", a.target]);
    row(["トーン", a.tone]);
    lines.push("");
    row(["時間", "投稿タイプ", "内容", "例文", "素材", "目的"]);
    a.daily.forEach((r) => row([r.time, r.type, r.content, r.example, r.material, r.goal]));
    lines.push("");
    row(["曜日", "テーマ", "内容"]);
    a.weekly.forEach((r) => row([r.day, r.theme, r.detail]));
    lines.push("");
    row(["タイミング", "ルーティン", "メモ"]);
    a.routines.forEach((r) => row([r.timing, r.task, r.note]));
    lines.push("");
  });

  row(["■ 運用ルール"]);
  plan.rules.forEach((r) => row([r]));

  return "﻿" + lines.join("\r\n");
};
