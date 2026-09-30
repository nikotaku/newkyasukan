// エステ魂「スカウト求人」の自動化で使う型・表示名と、候補の選び方（Vercelの処理と画面で共通）。

export type ScoutBatchStatus =
  | "collecting"
  | "pending_approval"
  | "approved"
  | "sending"
  | "done"
  | "empty"
  | "cancelled"
  | "failed";

export type ScoutCandidateStatus = "proposed" | "approved" | "excluded" | "sending" | "sent" | "failed" | "uncertain";

export interface ScoutSettings {
  enabled: boolean;
  daily_count: number;
  propose_at: string;
  template_name: string | null;
  preferred_areas: string[];
  only_preferred: boolean;
}

export const DEFAULT_SCOUT_SETTINGS: ScoutSettings = {
  enabled: false,
  daily_count: 10,
  propose_at: "11:00",
  template_name: null,
  preferred_areas: ["仙台", "宮城", "山形", "福島", "岩手", "秋田", "青森", "東北"],
  only_preferred: false,
};

export interface ScoutBatch {
  id: string;
  store_id: string;
  scout_date: string;
  status: ScoutBatchStatus;
  candidate_count: number;
  sent_count: number;
  failed_count: number;
  error_message: string | null;
  approved_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ScoutCandidateAttributes {
  age?: string;
  gender?: string;
  areas?: string;
  section?: string;
  preferred?: boolean;
}

export interface ScoutCandidate {
  id: string;
  batch_id: string;
  position: number;
  external_id: string;
  display_name: string | null;
  summary: string | null;
  attributes: ScoutCandidateAttributes | null;
  status: ScoutCandidateStatus;
  error_message: string | null;
  sent_at: string | null;
}

type Tone = "default" | "secondary" | "destructive" | "outline";

export const SCOUT_BATCH_STATUS: Record<ScoutBatchStatus, { label: string; tone: Tone; hint?: string }> = {
  collecting: { label: "候補を集めています", tone: "secondary", hint: "エステ魂のスカウト求人から候補を読んでいます（1〜2分）" },
  pending_approval: { label: "OK待ち", tone: "default", hint: "送る人を確認して「送る」を押してください" },
  approved: { label: "送信待ち", tone: "secondary", hint: "まもなく送信を始めます" },
  sending: { label: "送信中", tone: "secondary", hint: "1人ずつ送っています" },
  done: { label: "送信済み", tone: "outline" },
  empty: { label: "候補なし", tone: "outline", hint: "送れる候補がいませんでした" },
  cancelled: { label: "送らない", tone: "outline" },
  failed: { label: "止まりました", tone: "destructive" },
};

export const SCOUT_CANDIDATE_STATUS: Record<ScoutCandidateStatus, { label: string; tone: Tone }> = {
  proposed: { label: "候補", tone: "secondary" },
  approved: { label: "送信待ち", tone: "secondary" },
  excluded: { label: "送らない", tone: "outline" },
  sending: { label: "送信中", tone: "secondary" },
  sent: { label: "送信済み", tone: "default" },
  failed: { label: "送れなかった", tone: "destructive" },
  uncertain: { label: "要確認", tone: "destructive" },
};

/** エステ魂のスカウト一覧から読んだ候補（1人分） */
export interface ScoutListEntry {
  externalId: string; // data-row="resume,<ID>" の ID
  name: string;
  age: string;
  gender: string;
  areas: string;
  section: string;
  scouted: boolean; // 「スカウト済み」
  summary: string; // 自己PR（検索ページ）
}

/** 「(26歳 女)」→ 年齢・性別 */
export function parseAgeGender(text: string) {
  const match = text.normalize("NFKC").match(/(\d{2})\s*歳\s*([男女])?/);
  return { age: match?.[1] ?? "", gender: match?.[2] ?? "" };
}

const normalizeArea = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");

export function matchesPreferredArea(areas: string, preferred: string[]) {
  const target = normalizeArea(areas);
  return preferred.map(normalizeArea).filter(Boolean).some((area) => target.includes(area));
}

/**
 * 送る候補を選ぶ：スカウト済み・以前に送った人・女性以外を除き、優先エリアの人を先に、
 * 残りは一覧の順（新着順）で count 人まで。onlyPreferred なら優先エリアの人だけ。
 */
export function selectScoutCandidates(
  entries: ScoutListEntry[],
  options: { count: number; excludedIds: Iterable<string>; preferredAreas: string[]; onlyPreferred: boolean },
) {
  const excluded = new Set(options.excludedIds);
  const seen = new Set<string>();
  const eligible = entries.filter((entry) => {
    if (!entry.externalId || seen.has(entry.externalId)) return false;
    seen.add(entry.externalId);
    return !entry.scouted && !excluded.has(entry.externalId) && entry.gender !== "男";
  });
  const preferred = eligible.filter((entry) => matchesPreferredArea(entry.areas, options.preferredAreas));
  const others = options.onlyPreferred
    ? []
    : eligible.filter((entry) => !matchesPreferredArea(entry.areas, options.preferredAreas));
  return [...preferred, ...others]
    .slice(0, Math.max(0, options.count))
    .map((entry) => ({ ...entry, preferred: preferred.includes(entry) }));
}
