// セラピスト向けの「月収の目安」。広告（LP）とマイページで使う

export interface EarningsInput {
  daysPerWeek: number;
  sessionsPerDay: number; // 1日に入る本数（60分換算）
  backPer60: number; // 60分1本あたりの取り分
  nominationRate: number; // 指名の割合 (0〜1)
  nominationFee: number; // 指名1本あたりの取り分の上乗せ
}

export const WEEKS_PER_MONTH = 4.3;

export function monthlyEarnings(input: EarningsInput) {
  const sessions = input.daysPerWeek * WEEKS_PER_MONTH * input.sessionsPerDay;
  const base = sessions * input.backPer60;
  const nomination = sessions * Math.min(1, Math.max(0, input.nominationRate)) * input.nominationFee;
  return { sessions, base, nomination, total: base + nomination };
}
