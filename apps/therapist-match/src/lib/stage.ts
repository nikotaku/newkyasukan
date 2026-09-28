import type { ApplicationStatus, Stage } from "@/lib/types";

type Tone = "neutral" | "primary" | "good" | "warn" | "danger" | "gold";

export const STAGE_TONE: Record<Stage, Tone> = {
  新規登録: "warn",
  面談予約: "primary",
  面談済: "primary",
  応募中: "primary",
  体験入店: "gold",
  在籍: "good",
  定着: "good",
  離脱: "neutral",
};

export const APPLICATION_TONE: Record<ApplicationStatus, Tone> = {
  応募済: "primary",
  面接調整中: "primary",
  体験入店: "gold",
  在籍: "good",
  見送り: "neutral",
};

// コーチが担当している（伴走中の）人
export function isCoaching(stage: Stage) {
  return stage !== "定着" && stage !== "離脱";
}

export function daysSince(dateKey: string, today = new Date()) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const from = new Date(y, m - 1, d);
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}
