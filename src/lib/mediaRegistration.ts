// セラピストごとの媒体登録状況（エステ魂・O2・X・マイページ。エスランは掲載再開まで出さない）。
// 手でチェックする項目は casts の真偽値列、自動でわかる項目はエステ魂の連携結果・ログイン情報の有無・
// マイページの通知の登録（therapist_push_subscriptions）から出す。

// エスラン（メンズエステランキング）は今は掲載していないので、登録状況・ランキング転記・シフトの登録欄を出さない。
// 掲載を再開するときは true に戻す（casts.esuran_listed / shifts.esran_registered などのデータは残してある）
export const ESTHE_RANKING_ACTIVE = false;

const ALL_CHECKLIST_FIELDS = [
  "estama_listed",
  "esuran_listed",
  "o2_created",
  "o2_linkage_requested",
  "x_created",
  "x_list_added",
  "x_ff_completed",
  "self_intro_tweeted",
] as const;

export type MediaChecklistField = (typeof ALL_CHECKLIST_FIELDS)[number];

export const MEDIA_CHECKLIST_FIELDS: readonly MediaChecklistField[] = ALL_CHECKLIST_FIELDS.filter(
  (field) => ESTHE_RANKING_ACTIVE || field !== "esuran_listed",
);

export type MediaChecklist = Record<MediaChecklistField, boolean>;

export interface MediaColumn {
  media: "エステ魂" | "エスラン" | "O2" | "X" | "マイページ";
  label: string;
  // field があれば手で切り替えられる。auto は連携結果から自動で決まる（読み取り専用）
  field?: MediaChecklistField;
  auto?: "estama_synced" | "estama_soul" | "o2_login" | "x_login" | "portal_app" | "portal_test";
}

const ALL_COLUMNS: MediaColumn[] = [
  { media: "エステ魂", label: "掲載", field: "estama_listed" },
  { media: "エステ魂", label: "自動連携", auto: "estama_synced" },
  { media: "エステ魂", label: "魂セラピスト", auto: "estama_soul" },
  { media: "エスラン", label: "掲載", field: "esuran_listed" },
  { media: "O2", label: "作成", field: "o2_created" },
  { media: "O2", label: "店舗連携申請", field: "o2_linkage_requested" },
  { media: "O2", label: "ログイン情報", auto: "o2_login" },
  { media: "X", label: "作成", field: "x_created" },
  { media: "X", label: "リスト入り", field: "x_list_added" },
  { media: "X", label: "FF", field: "x_ff_completed" },
  { media: "X", label: "自己紹介ツイート", field: "self_intro_tweeted" },
  { media: "X", label: "ログイン情報", auto: "x_login" },
  // マイページをホーム画面に追加して通知をオンにした → テスト通知を受け取った（ここまでで設定完了）
  { media: "マイページ", label: "ホーム画面・通知", auto: "portal_app" },
  { media: "マイページ", label: "テスト通知", auto: "portal_test" },
];

export const MEDIA_COLUMNS: MediaColumn[] = ALL_COLUMNS.filter((column) => ESTHE_RANKING_ACTIVE || column.media !== "エスラン");

// 一覧に出す媒体（表の見出しの順）
export const MEDIA_NAMES = [...new Set(MEDIA_COLUMNS.map((column) => column.media))];

export interface MediaAutoStatus {
  estama_synced: boolean;
  estama_soul: boolean;
  o2_login: boolean;
  x_login: boolean;
  portal_app: boolean;
  portal_test: boolean;
  estama_error: string | null;
}

export interface PortalDevice {
  standalone: boolean;
  test_confirmed_at: string | null;
}

export function mediaProgress(checklist: Partial<MediaChecklist>) {
  const done = MEDIA_CHECKLIST_FIELDS.filter((field) => checklist[field]).length;
  return { done, total: MEDIA_CHECKLIST_FIELDS.length, ratio: done / MEDIA_CHECKLIST_FIELDS.length };
}

// エステ魂でどこまで進んでいるか（一覧で1語で見せる）
export function estamaStage(checklist: Partial<MediaChecklist>, auto: Partial<MediaAutoStatus>) {
  if (auto.estama_soul) return "魂セラピストまで完了";
  if (auto.estama_synced) return "プロフィール連携済み";
  if (checklist.estama_listed) return "掲載のみ";
  return "未登録";
}

export function autoStatusFrom(input: {
  estamaProfile?: { sync_status: string | null; soul_status: string | null; last_error: string | null } | null;
  sns?: { credential_configured?: boolean; x_login_id?: string | null; x_credential_configured?: boolean; estama_credential_configured?: boolean } | null;
  portalDevices?: PortalDevice[] | null;
}): MediaAutoStatus {
  const profile = input.estamaProfile;
  const homeScreenDevices = (input.portalDevices || []).filter((device) => device.standalone);
  return {
    estama_synced: profile?.sync_status === "synced",
    estama_soul: profile?.soul_status === "configured" || Boolean(input.sns?.estama_credential_configured),
    o2_login: Boolean(input.sns?.credential_configured),
    x_login: Boolean(input.sns?.x_credential_configured || input.sns?.x_login_id?.trim()),
    portal_app: homeScreenDevices.length > 0,
    // ホーム画面に追加したアプリでテスト通知を受け取ったら完了
    portal_test: homeScreenDevices.some((device) => Boolean(device.test_confirmed_at)),
    estama_error: profile?.last_error || null,
  };
}
