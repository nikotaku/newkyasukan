/**
 * X運用表「今日の投稿」の材料（出勤・空き枠・割引・口コミ・電話番号）を DB から集めて XPostContext にする。
 * 管理画面（XTodayPosts）と、決まった形の投稿を自動で出す Edge Function（x-auto-post）の両方で使うので、
 * ブラウザ・Deno どちらでも動くよう supabase クライアントは引数でもらい、画面の API は使わない。
 */
import { DEFAULT_RESERVATION_INTERVAL_MINUTES } from "./availability.ts";
import { getCastBookingUrl, getCustomDomainBaseUrl } from "./bookingUrl.ts";
import { businessDate, nextAvailableFor, shiftDate, type XCast, type XPostContext } from "./xDailyPosts.ts";

// supabase-js のクライアント（ブラウザ版・Deno版の型の違いを吸収する）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type XContextClient = { from: (table: string) => any };

type ShiftRow = {
  shift_date: string;
  cast_id: string;
  start_time: string;
  end_time: string;
  approval_status: string | null;
  casts: { id: string; name: string; photo: string | null; shop_comment: string | null; profile: string | null; is_active: boolean; is_visible: boolean } | null;
};

export interface XContextInput {
  storeId: string;
  storeName: string;
  customDomain?: string | null;
  // 独自ドメインがない店舗の予約URLの元（画面では window.location.origin）
  fallbackBaseUrl: string;
  date: string; // 営業日 YYYY-MM-DD
  now?: Date;
}

/** 日本時間の「今」。営業日は朝6時切り替えなので、分は 0〜1439 のまま返す */
export function tokyoClock(now: Date) {
  const tokyo = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { minutes: tokyo.getUTCHours() * 60 + tokyo.getUTCMinutes(), label: tokyo.toISOString().slice(11, 16) };
}

export const discountLabel = (type: string, value: number) =>
  /percent/.test(type) ? `${value}%OFF` : `${Number(value).toLocaleString("ja-JP")}円引き`;

export async function loadXPostContext(client: XContextClient, input: XContextInput): Promise<{ context: XPostContext; errors: string[] }> {
  const now = input.now ?? new Date();
  const { date, storeId } = input;
  const tomorrow = shiftDate(date, 1);
  const [shiftsRes, reservationsRes, settingsRes, discountsRes, reviewsRes, infoRes] = await Promise.all([
    client
      .from("shifts")
      .select("shift_date,cast_id,start_time,end_time,approval_status,casts(id,name,photo,shop_comment,profile,is_active,is_visible)")
      .eq("store_id", storeId)
      .in("shift_date", [date, tomorrow])
      .order("start_time"),
    client
      .from("reservations")
      .select("cast_id,start_time,duration,status")
      .eq("store_id", storeId)
      .eq("reservation_date", date)
      .neq("status", "cancelled"),
    client.from("shop_settings").select("reservation_interval_minutes").eq("store_id", storeId).limit(1).maybeSingle(),
    client.from("discounts").select("name,discount_type,discount_value").eq("store_id", storeId).eq("is_active", true).order("discount_value", { ascending: false }),
    client
      .from("customer_reviews")
      .select("therapist_name,review_text,rating")
      .eq("store_id", storeId)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(5),
    client.from("store_info").select("phone").eq("store_id", storeId).limit(1).maybeSingle(),
  ]);

  const errors: string[] = [];
  if (shiftsRes.error) errors.push(`出勤を読み込めませんでした: ${shiftsRes.error.message}`);
  if (reservationsRes.error) errors.push(`予約を読み込めませんでした: ${reservationsRes.error.message}`);

  const interval = (settingsRes.data as { reservation_interval_minutes?: number } | null)?.reservation_interval_minutes ?? DEFAULT_RESERVATION_INTERVAL_MINUTES;
  const reservations = (reservationsRes.data ?? []) as Array<{ cast_id: string; start_time: string; duration: number }>;
  const clock = tokyoClock(now);
  const isToday = date === businessDate(now);
  const bookingBase = getCustomDomainBaseUrl(input.customDomain) ?? input.fallbackBaseUrl;

  const castsFor = (day: string, withAvailability: boolean): XCast[] => {
    const seen = new Set<string>();
    return ((shiftsRes.data ?? []) as ShiftRow[])
      .filter((s) => s.shift_date === day && s.approval_status !== "rejected" && s.casts?.is_active && s.casts?.is_visible)
      .filter((s) => (seen.has(s.cast_id) ? false : (seen.add(s.cast_id), true)))
      .map((s) => ({
        id: s.cast_id,
        name: s.casts!.name,
        photo: s.casts!.photo,
        start: s.start_time.slice(0, 5),
        end: s.end_time.slice(0, 5),
        nextAvailable: withAvailability
          ? nextAvailableFor(
              { start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) },
              reservations.filter((r) => r.cast_id === s.cast_id),
              interval,
              isToday ? clock.minutes : null,
            )
          : null,
        bookingUrl: getCastBookingUrl(bookingBase, s.cast_id),
        intro: s.casts!.shop_comment || s.casts!.profile,
      }));
  };

  const phone = ((infoRes.data as { phone?: string } | null)?.phone ?? "").replace(/\D/g, "");
  return {
    errors,
    context: {
      date,
      isToday,
      nowLabel: clock.label,
      storeName: input.storeName,
      siteUrl: bookingBase,
      phoneDisplay: phone ? phone.replace(/^(0\d{2})(\d{4})(\d{4})$/, "$1-$2-$3") : null,
      today: castsFor(date, true),
      tomorrow: castsFor(tomorrow, false),
      discounts: ((discountsRes.data ?? []) as Array<{ name: string; discount_type: string; discount_value: number }>).map((d) => ({
        name: d.name,
        label: discountLabel(d.discount_type, d.discount_value),
      })),
      reviews: ((reviewsRes.data ?? []) as Array<{ therapist_name: string | null; review_text: string | null; rating: number | null }>).map((r) => ({
        therapistName: r.therapist_name,
        text: r.review_text ?? "",
        rating: r.rating,
      })),
    },
  };
}
