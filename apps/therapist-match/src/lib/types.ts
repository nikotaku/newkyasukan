export const AREAS = ["仙台", "東京", "名古屋", "大阪", "福岡"] as const;
export type Area = (typeof AREAS)[number];

export const STORE_TAGS = ["未経験歓迎", "日払い", "保証あり", "講習あり", "顔出しなし可", "寮あり", "送迎あり", "週1日〜OK"] as const;
export type StoreTag = (typeof STORE_TAGS)[number];

// 掲載料は定額（入店人数やセラピストの売上に連動させない。README の「収益モデルの前提」参照）
export const PLANS = {
  light: { label: "ライト", fee: 30000, note: "一覧に掲載" },
  standard: { label: "スタンダード", fee: 50000, note: "掲載＋コーチの店舗取材・紹介文" },
  premium: { label: "プレミアム", fee: 80000, note: "上位表示＋店舗スタッフ向け研修" },
} as const;
export type PlanKey = keyof typeof PLANS;

export type StoreStatus = "掲載中" | "審査中" | "停止";

export interface Store {
  id: string;
  name: string;
  area: Area;
  station: string;
  hours: string;
  avgDaily: number; // 在籍セラピストの平均日給（店舗の自己申告→取材で確認）
  back60: number; // 60分コース1本あたりのセラピストの取り分
  guarantee: number | null; // 日給保証（なければ null）
  slots: number; // 今月の受け入れ枠
  tags: StoreTag[];
  coachNote: string; // 取材したコーチの一言
  description: string;
  plan: PlanKey;
  status: StoreStatus;
}

export const STAGES = ["新規登録", "面談予約", "面談済", "応募中", "体験入店", "在籍", "定着", "離脱"] as const;
export type Stage = (typeof STAGES)[number];

export const APPLICATION_STATUSES = ["応募済", "面接調整中", "体験入店", "在籍", "見送り"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  storeId: string;
  status: ApplicationStatus;
  updatedAt: string;
}

export const EXPERIENCES = ["未経験", "経験あり（1年未満）", "経験あり（1年以上）"] as const;
export type Experience = (typeof EXPERIENCES)[number];

export const PACES = ["週1〜2日", "週3〜4日", "週5日以上"] as const;
export type Pace = (typeof PACES)[number];

export interface Therapist {
  id: string;
  nickname: string;
  age: number;
  area: Area;
  experience: Experience;
  pace: Pace;
  goal: number; // 目標月収（円）
  contactType: "LINE" | "電話";
  contact: string;
  avoidNote: string; // 身バレ対策：避けたい地域・時間帯など
  createdAt: string; // YYYY-MM-DD
  stage: Stage;
  coachId: string | null;
  applications: Application[];
  lessonsDone: string[];
}

export interface Coach {
  id: string;
  name: string;
  profile: string;
  capacity: number; // 同時に担当できる人数
}

export interface Lesson {
  id: string;
  week: string;
  title: string;
  body: string;
}
