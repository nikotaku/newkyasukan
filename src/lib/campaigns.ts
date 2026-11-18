// 設定ダッシュボードの「キャンペーン」（campaigns 表）。適用期間と「アーカイブ」から今の状態を出す。
// 画面は src/components/settings/CampaignManager.tsx、テスト npm run test:rate-master（tests/campaigns.test.ts）。

export interface CampaignRecord {
  id: string;
  name: string;
  details: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  discount_id: string | null;
  archived_at: string | null;
  display_order: number | null;
  updated_at?: string | null;
}

export type CampaignStatus = "running" | "upcoming" | "ended" | "archived";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  running: "継続中",
  upcoming: "開始前",
  ended: "期間終了",
  archived: "アーカイブ",
};

/** 今日（YYYY-MM-DD、日本時間）。期間は日付で比べる */
export function todayJst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** アーカイブしたものはアーカイブ。それ以外は期間で 開始前／継続中／期間終了（期間が空なら継続中） */
export function campaignStatus(campaign: Pick<CampaignRecord, "start_date" | "end_date" | "archived_at">, today: string): CampaignStatus {
  if (campaign.archived_at) return "archived";
  if (campaign.start_date && today < campaign.start_date) return "upcoming";
  if (campaign.end_date && today > campaign.end_date) return "ended";
  return "running";
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}/${month}/${day}`;
}

/** 「2026/11/1 〜 2026/11/30」「2026/11/1 〜（期限なし）」「期間の決まりなし」 */
export function campaignPeriodLabel(campaign: Pick<CampaignRecord, "start_date" | "end_date">): string {
  if (!campaign.start_date && !campaign.end_date) return "期間の決まりなし";
  const start = campaign.start_date ? shortDate(campaign.start_date) : "";
  const end = campaign.end_date ? shortDate(campaign.end_date) : "（期限なし）";
  return `${start} 〜 ${end}`;
}

/** 終わりまでの日数（今日が最終日なら 0）。終わりが無い・過ぎていれば null */
export function campaignDaysLeft(campaign: Pick<CampaignRecord, "end_date">, today: string): number | null {
  if (!campaign.end_date || campaign.end_date < today) return null;
  return Math.round((Date.parse(`${campaign.end_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function validateCampaign(input: { name: string; start_date: string; end_date: string }): string | null {
  if (!input.name.trim()) return "キャンペーンの名前を入れてください";
  if (input.start_date && input.end_date && input.start_date > input.end_date) return "終わりの日が始まりの日より前になっています";
  return null;
}

/** 一覧の並び：継続中 → 開始前 → 期間終了 → アーカイブ。同じ中は始まりの新しい順 */
export function sortCampaigns<T extends CampaignRecord>(rows: T[], today: string): T[] {
  const rank: Record<CampaignStatus, number> = { running: 0, upcoming: 1, ended: 2, archived: 3 };
  return [...rows].sort((a, b) => {
    const diff = rank[campaignStatus(a, today)] - rank[campaignStatus(b, today)];
    if (diff !== 0) return diff;
    return (b.start_date ?? "").localeCompare(a.start_date ?? "") || a.name.localeCompare(b.name, "ja");
  });
}
