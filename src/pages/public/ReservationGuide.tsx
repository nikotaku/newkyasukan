import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, Copy, CreditCard, ExternalLink, Loader2, MapPin, MessageCircle, Phone, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone } from "@/hooks/useStoreContact";
import { RouteGuideSteps, type RouteGuideStep } from "@/components/public/RouteGuideSteps";
import { GUIDE_PAYMENT_LABELS, normalizeGuidePayments, type GuidePayment } from "@/lib/reservationGuidePayment";

// RPC get_reservation_guide の返り値（supabase/migrations/20260928120000_reservation_guide.sql）
interface ReservationGuideData {
  customer_name: string | null;
  reservation_date: string;
  start_time: string | null;
  duration: number | null;
  course_name: string | null;
  options: string[];
  cast_name: string | null;
  price: number | null;
  store: { name: string | null; phone: string | null; line_url: string | null };
  room: {
    name: string;
    address: string | null;
    map_url: string | null;
    landmark: string | null;
    caution_text: string | null;
    guide_steps: RouteGuideStep[] | null;
  } | null;
  // カード・PayPayで払う分（手数料込みの金額・決済ページ・手順）。現金だけの予約は空
  payments?: unknown;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const formatDate = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${m}月${d}日(${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};

const cardStyle = {
  backgroundColor: "var(--pub-card,#211320)",
  border: "1px solid var(--pub-border,#4a2740)",
};

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4" style={cardStyle}>
      <h2 className="flex items-center gap-2 text-sm font-bold mb-3" style={{ color: "var(--pub-accent-light,#f2a0bc)" }}>
        {icon}{title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-[4.5rem] shrink-0" style={{ color: "var(--pub-text-muted,#a98496)" }}>{label}</span>
      <span className="flex-1 min-w-0 break-words" style={{ color: "var(--pub-text,#f7e9f0)" }}>{value}</span>
    </div>
  );
}

const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;

/** カード・PayPayで予約したお客様への、お支払いのご案内（金額・手順・決済ページ） */
function PaymentGuide({ payment, onCopyAmount }: { payment: GuidePayment; onCopyAmount: (amount: number) => void }) {
  const label = GUIDE_PAYMENT_LABELS[payment.method];
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-3" style={{ backgroundColor: "var(--pub-card2,#2b1a28)" }}>
        <p className="text-xs" style={{ color: "var(--pub-text-muted,#a98496)" }}>{label.name}でのお支払い金額（手数料込み）</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="flex-1 text-2xl font-bold tabular-nums">{yen(payment.amount)}</p>
          <button
            type="button"
            onClick={() => onCopyAmount(payment.amount)}
            className="shrink-0 rounded-full p-2"
            style={{ border: "1px solid var(--pub-border,#4a2740)" }}
            aria-label="金額をコピー"
          >
            <Copy size={14} />
          </button>
        </div>
        {payment.fee > 0 && (
          <p className="mt-1 text-xs" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>
            料金 {yen(payment.amount - payment.fee)} ＋ 決済手数料 {yen(payment.fee)}
          </p>
        )}
      </div>

      {payment.steps.length > 0 && (
        <ol className="space-y-2">
          {payment.steps.map((step, index) => (
            <li key={index} className="flex gap-2.5 text-sm leading-6">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: "var(--pub-accent,#d4547a)" }}
              >
                {index + 1}
              </span>
              <span className="flex-1">{step}</span>
            </li>
          ))}
        </ol>
      )}

      {payment.link && (
        <a
          href={payment.link}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-white"
          style={{ backgroundColor: "var(--pub-accent,#d4547a)" }}
        >
          <CreditCard size={16} />{label.button}<ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

/**
 * 予約ごとの案内ページ（SMSで送るリンク /g/:token）。
 * 予約内容・ルームの住所と地図・道順（写真のステップ）・来店時のお願い・連絡先をまとめて見せる。
 */
export default function ReservationGuide() {
  const { token = "" } = useParams();
  const [guide, setGuide] = useState<ReservationGuideData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    // 予約ごとの個人向けページなので検索エンジンに載せない
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_reservation_guide" as never, { p_token: token } as never).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        setState("missing");
        return;
      }
      setGuide(data as unknown as ReservationGuideData);
      setState("ready");
    });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    document.title = guide?.store.name ? `ご予約のご案内｜${guide.store.name}` : "ご予約のご案内";
  }, [guide?.store.name]);

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("コピーできませんでした");
    }
  };
  const copyAddress = (address: string) => copyText(address, "住所をコピーしました");

  const page = (children: React.ReactNode) => (
    <div className="min-h-screen px-4 py-6" style={{ backgroundColor: "var(--pub-bg,#150a11)", color: "var(--pub-text,#f7e9f0)" }}>
      <div className="mx-auto max-w-md space-y-4">{children}</div>
    </div>
  );

  if (state === "loading") {
    return page(
      <div className="flex justify-center py-24"><Loader2 className="animate-spin" style={{ color: "var(--pub-accent,#d4547a)" }} /></div>,
    );
  }

  if (state === "missing" || !guide) {
    return page(
      <div className="rounded-2xl p-6 text-center text-sm leading-7" style={cardStyle}>
        <p className="font-bold mb-2">ご案内ページを表示できません</p>
        <p style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>
          ご予約日を過ぎたか、ご予約が変更・キャンセルされた可能性があります。
          ご不明な点はお店までお電話でお問い合わせください。
        </p>
      </div>,
    );
  }

  const phone = guide.store.phone?.replace(/\D/g, "") || "";
  const steps = (guide.room?.guide_steps || []).filter((step) => step.image_url || step.text?.trim());
  const payments = normalizeGuidePayments(guide.payments);

  return page(
    <>
      <header className="text-center pt-2 pb-1">
        {guide.store.name && <p className="text-xs tracking-[0.3em]" style={{ color: "var(--pub-text-muted,#a98496)" }}>{guide.store.name}</p>}
        <h1 className="mt-1 text-xl font-bold">ご予約のご案内</h1>
        {guide.customer_name && (
          <p className="mt-2 text-sm" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>{guide.customer_name} 様、ご予約ありがとうございます。</p>
        )}
      </header>

      <Section title="ご予約内容" icon={<CalendarClock size={16} />}>
        <Row
          label="日時"
          value={`${formatDate(guide.reservation_date)} ${guide.start_time?.slice(0, 5) ?? ""}〜${guide.duration ? `（${guide.duration}分）` : ""}`}
        />
        {guide.course_name && <Row label="コース" value={guide.course_name} />}
        {guide.options.length > 0 && <Row label="オプション" value={guide.options.join("、")} />}
        {guide.cast_name && <Row label="担当" value={guide.cast_name} />}
        {guide.price != null && guide.price > 0 && <Row label="料金" value={`${guide.price.toLocaleString("ja-JP")}円`} />}
      </Section>

      {payments.length > 0 && (
        <Section title="お支払いのご案内" icon={<CreditCard size={16} />}>
          <div className="space-y-5">
            {payments.map((payment) => (
              <PaymentGuide
                key={payment.method}
                payment={payment}
                onCopyAmount={(amount) => copyText(String(amount), "金額をコピーしました")}
              />
            ))}
          </div>
        </Section>
      )}

      {guide.room && (
        <Section title={`ルームのご案内｜${guide.room.name}`} icon={<MapPin size={16} />}>
          {guide.room.address && (
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm leading-6">{guide.room.address}</p>
              <button
                type="button"
                onClick={() => copyAddress(guide.room!.address!)}
                className="shrink-0 rounded-full p-2"
                style={{ border: "1px solid var(--pub-border,#4a2740)" }}
                aria-label="住所をコピー"
              >
                <Copy size={14} />
              </button>
            </div>
          )}
          {guide.room.landmark && (
            <p className="mt-2 text-sm" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>目印：{guide.room.landmark}</p>
          )}
          {guide.room.map_url && (
            <a
              href={guide.room.map_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-white"
              style={{ backgroundColor: "var(--pub-accent,#d4547a)" }}
            >
              <MapPin size={16} />Googleマップで道順を見る
            </a>
          )}
        </Section>
      )}

      {steps.length > 0 && (
        <Section title="ルームまでの道順" icon={<MapPin size={16} />}>
          <RouteGuideSteps steps={steps} />
        </Section>
      )}

      {guide.room?.caution_text?.trim() && (
        <Section title="ご来店時のお願い" icon={<TriangleAlert size={16} />}>
          <p className="text-sm leading-7 whitespace-pre-wrap">{guide.room.caution_text.trim()}</p>
        </Section>
      )}

      <Section title="ご予約の変更・キャンセル" icon={<Phone size={16} />}>
        <p className="text-sm mb-3" style={{ color: "var(--pub-text-mid,#dfc0cf)" }}>必ずお電話でご連絡ください。</p>
        <div className="space-y-2">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold"
              style={{ border: "1px solid var(--pub-accent,#d4547a)", color: "var(--pub-text,#f7e9f0)" }}
            >
              <Phone size={16} />{formatPhone(phone)} に電話する
            </a>
          )}
          {guide.store.line_url && (
            <a
              href={guide.store.line_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-white bg-[#06c755]"
            >
              <MessageCircle size={16} />LINEで問い合わせる
            </a>
          )}
        </div>
      </Section>
    </>,
  );
}
