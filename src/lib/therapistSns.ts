// セラピストのマイページの「SNSアカウント」：お店が用意した X・O2 のログイン情報、設定マニュアル、例文。
// データは RPC get_therapist_sns_account（本人のマイページのトークンで本人確認）。

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TherapistSnsAccountData {
  notified_at: string | null;
  seen_at: string | null;
  x: { login_id: string | null; password: string | null; profile_url: string | null } | null;
  o2: { login_id: string | null; login_email: string | null; password: string | null; profile_url: string | null } | null;
}

export const callSnsRpc = (name: string, args: Record<string, unknown>) => supabase.rpc(name as never, args as never);

export function useTherapistSnsAccount(token: string | undefined) {
  const [account, setAccount] = useState<TherapistSnsAccountData | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const { data, error } = await callSnsRpc("get_therapist_sns_account", { p_token: token });
    setLoading(false);
    if (!error) setAccount((data ?? null) as TherapistSnsAccountData | null);
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { account, loading, reload };
}

export const hasUnseenSnsNotice = (account: TherapistSnsAccountData | null) =>
  Boolean(account?.notified_at && !account.seen_at);

export const SNS_SETUP_GUIDE_IMAGES = [
  { src: "/therapist-guide/sns-setup-1-x.png", alt: "STEP1 Xのトップを設定" },
  { src: "/therapist-guide/sns-setup-2-o2.png", alt: "STEP2 O2のトップを設定" },
  { src: "/therapist-guide/sns-setup-3-bio.png", alt: "STEP3 自己紹介（BIO）を書く" },
  { src: "/therapist-guide/sns-setup-4-first-post.png", alt: "STEP4 初回ポストを投稿" },
];

// 源氏名の後ろの「🔰」などの記号は例文に入れない
const displayName = (name: string) => name.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim() || name;

export function buildSnsBio(name: string, bookingUrl: string) {
  return [
    `仙台メンズエステ艶華の${displayName(name)}です🌸`,
    "ゆっくり丁寧なリンパマッサージが得意です",
    "出勤・空き枠はここでお知らせします✨",
    "ご予約はこちら👇",
    bookingUrl,
  ].join("\n");
}

export function buildSnsFirstPost(name: string) {
  return [
    "はじめまして🌸",
    `仙台メンズエステ艶華に入店しました、${displayName(name)}です。`,
    "ゆっくり丁寧な施術で、日頃の疲れを癒します✨",
    "◯月◯日から出勤します。ご予約お待ちしています♡",
    "#仙台メンエス #艶華 #メンズエステ",
  ].join("\n");
}

/** プロフィール文の文字数（Xの自己紹介は160文字まで） */
export const bioLength = (text: string) => Array.from(text).length;
