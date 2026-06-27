import { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
import { ja } from "date-fns/locale";
import { Heart, Sparkles, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";

/**
 * はる専用の予約リクエストフォーム（可愛いデザイン）。
 * 送信された予約は status="pending" / referral_source="はる専用フォーム" で
 * reservations に登録され、管理画面の予約ボードにリクエストとしてストックされる。
 */

const HARU_CAST_ID = "4b2fc0c8-ccad-48a6-9a32-f7898381f68b";
const HARU_PHOTO = "https://cdn2-caskan.com/caskan/img/cast/1778034916_8931147.jpeg";

interface BackRate {
  course_type: string;
  duration: number;
  customer_price: number;
}

// 30分刻みの希望時間候補（11:00〜23:30）
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 11 * 60; m <= 23 * 60 + 30; m += 30) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
})();

export default function HaruBooking() {
  const { storeId } = useStore();
  const [backRates, setBackRates] = useState<BackRate[]>([]);
  const [nominationFee, setNominationFee] = useState(0);

  const [date, setDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [time, setTime] = useState("");
  const [courseType, setCourseType] = useState("");
  const [duration, setDuration] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "はる｜専用予約ページ";
    supabase.rpc("get_public_back_rates").then(({ data }) => {
      const rates = (data || []) as BackRate[];
      setBackRates(rates);
      const aroma = rates.find((r) => r.course_type === "アロマオイル");
      if (aroma) { setCourseType(aroma.course_type); }
    });
    supabase.from("nomination_rates").select("nomination_type, customer_price").then(({ data }) => {
      const net = (data || []).find((n: any) => n.nomination_type === "ネット指名");
      if (net) setNominationFee(net.customer_price ?? 0);
    });
  }, []);

  const courseTypes = [...new Set(backRates.map((r) => r.course_type))];
  const durationsFor = (ct: string) =>
    backRates.filter((r) => r.course_type === ct).sort((a, b) => a.duration - b.duration);

  const coursePrice = backRates.find(
    (r) => r.course_type === courseType && r.duration === duration
  )?.customer_price ?? 0;
  const total = coursePrice > 0 ? coursePrice + nominationFee : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("お名前を入力してね"); return; }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) { setError("電話番号を入力してね"); return; }
    if (!date) { setError("希望日を選んでね"); return; }
    if (!time) { setError("希望時間を選んでね"); return; }
    if (!courseType || !duration) { setError("コースを選んでね"); return; }

    setSubmitting(true);
    try {
      const courseName = `${courseType} ${duration}分`;
      const { error: insErr } = await supabase.from("reservations").insert([{
        cast_id: HARU_CAST_ID,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        reservation_date: date,
        start_time: time,
        duration,
        course_type: courseType,
        course_name: courseName,
        nomination_type: "ネット指名",
        price: total,
        payment_method: "現金",
        notes: notes.trim() || null,
        referral_source: "はる専用フォーム",
        status: "pending",
        payment_status: "unpaid",
        created_by: null,
        store_id: storeId,
      }]);
      if (insErr) throw insErr;

      // LINE通知（失敗しても完了表示は継続）
      try {
        const dateStr = format(new Date(`${date}T00:00:00`), "yyyy年M月d日(E)", { locale: ja });
        await supabase.functions.invoke("notify-line-booking", {
          body: {
            customer_name: name.trim(),
            customer_phone: phone.trim(),
            cast_name: "はる",
            reservation_date: dateStr,
            start_time: time,
            course_name: courseName,
            nomination_type: "ネット指名",
            price: total,
            payment_method: "現金",
            notes: `【はる専用フォーム】${notes.trim()}`,
          },
        });
      } catch (notifyErr) {
        console.error("LINE notify failed:", notifyErr);
      }

      setDone(true);
    } catch (err) {
      console.error(err);
      setError("送信に失敗しました。お手数ですが、もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-100 via-rose-50 to-white flex items-center justify-center p-5">
        <div className="max-w-sm w-full text-center bg-white/90 backdrop-blur rounded-[2rem] shadow-xl p-8 space-y-5 border border-pink-100">
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-pink-400 to-rose-400 flex items-center justify-center shadow-lg">
            <Check className="text-white" size={40} />
          </div>
          <h1 className="text-xl font-bold text-rose-500">予約リクエスト完了♡</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            ご予約リクエストありがとうございます！<br />
            内容を確認して、<span className="font-bold text-rose-500">はる</span>または<br />スタッフよりご連絡いたします💌
          </p>
          <div className="bg-pink-50 rounded-2xl p-4 text-sm text-left space-y-1 text-gray-700">
            <p>📅 {format(new Date(`${date}T00:00:00`), "M月d日(E)", { locale: ja })} {time}〜</p>
            <p>💆 {courseType} {duration}分</p>
            {total > 0 && <p>💰 ¥{total.toLocaleString()}（目安）</p>}
          </div>
          <p className="text-xs text-gray-400">※ この時点ではまだ予約は確定していません。返信をもって確定となります。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-100 via-rose-50 to-white pb-10">
      {/* ヒーロー */}
      <header className="relative text-center pt-10 pb-6 px-5">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <Sparkles className="absolute top-6 left-6 text-pink-300/60" size={22} />
          <Heart className="absolute top-12 right-8 text-rose-300/60 fill-rose-200" size={18} />
          <Heart className="absolute top-24 left-10 text-pink-300/50 fill-pink-200" size={14} />
        </div>
        <div className="relative">
          <div className="mx-auto w-28 h-28 rounded-full p-1 bg-gradient-to-br from-pink-400 to-rose-300 shadow-lg">
            <img src={HARU_PHOTO} alt="はる" className="w-full h-full rounded-full object-cover object-top border-2 border-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-rose-500 tracking-wide">
            はる<span className="text-base font-medium text-pink-400"> 専用予約ページ</span>
          </h1>
          <p className="mt-1.5 text-sm text-pink-500/80">
            会いに来てくれて嬉しいな♡<br />下のフォームから予約してね💕
          </p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5">
        <form onSubmit={handleSubmit} className="bg-white/95 backdrop-blur rounded-[2rem] shadow-lg border border-pink-100 p-6 space-y-6">
          {/* 希望日 */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold text-rose-500 mb-2">
              <Heart size={14} className="fill-rose-300 text-rose-300" />希望日
            </label>
            <input
              type="date"
              value={date}
              min={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-pink-50/50 px-4 py-3 text-sm focus:outline-none"
            />
          </div>

          {/* 希望時間 */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold text-rose-500 mb-2">
              <Heart size={14} className="fill-rose-300 text-rose-300" />希望時間
            </label>
            <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTime(t)}
                  className={`py-2 rounded-xl text-sm font-medium transition-all ${
                    time === t
                      ? "bg-gradient-to-br from-pink-400 to-rose-400 text-white shadow-md scale-105"
                      : "bg-pink-50 text-rose-400 hover:bg-pink-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">※ 細かい時間はひとこと欄で相談OK</p>
          </div>

          {/* コース */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold text-rose-500 mb-2">
              <Heart size={14} className="fill-rose-300 text-rose-300" />コース
            </label>
            {courseTypes.length > 1 && (
              <div className="flex gap-2 mb-3">
                {courseTypes.map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => { setCourseType(ct); setDuration(0); }}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                      courseType === ct
                        ? "bg-gradient-to-br from-pink-400 to-rose-400 text-white shadow-md"
                        : "bg-pink-50 text-rose-400 hover:bg-pink-100"
                    }`}
                  >
                    {ct}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {durationsFor(courseType).map((r) => (
                <button
                  key={r.duration}
                  type="button"
                  onClick={() => setDuration(r.duration)}
                  className={`py-2.5 rounded-xl text-xs font-medium leading-tight transition-all ${
                    duration === r.duration
                      ? "bg-gradient-to-br from-pink-400 to-rose-400 text-white shadow-md scale-105"
                      : "bg-pink-50 text-rose-400 hover:bg-pink-100"
                  }`}
                >
                  {r.duration}分<br />¥{r.customer_price.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* お名前 */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold text-rose-500 mb-2">
              <Heart size={14} className="fill-rose-300 text-rose-300" />お名前
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：たろう"
              className="w-full rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-pink-50/50 px-4 py-3 text-sm focus:outline-none"
            />
          </div>

          {/* 電話番号 */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold text-rose-500 mb-2">
              <Heart size={14} className="fill-rose-300 text-rose-300" />電話番号
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="090-1234-5678"
              className="w-full rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-pink-50/50 px-4 py-3 text-sm focus:outline-none"
            />
            <p className="text-[11px] text-gray-400 mt-1.5">※ SMSで確認のご連絡をします</p>
          </div>

          {/* ひとこと */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-bold text-rose-500 mb-2">
              <Heart size={14} className="fill-rose-300 text-rose-300" />はるへひとこと（任意）
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="オプションのご希望、細かい時間の相談など♡"
              className="w-full rounded-2xl border-2 border-pink-100 focus:border-pink-300 bg-pink-50/50 px-4 py-3 text-sm focus:outline-none resize-none"
            />
          </div>

          {/* 合計目安 */}
          {total > 0 && (
            <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-2xl p-4 flex items-center justify-between border border-pink-100">
              <span className="text-sm font-bold text-rose-500">ご料金（目安）</span>
              <span className="text-2xl font-bold text-rose-500">¥{total.toLocaleString()}</span>
            </div>
          )}

          {error && <p className="text-sm text-rose-500 text-center font-medium">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-pink-400 to-rose-400 text-white font-bold text-base shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 size={18} className="animate-spin" />送信中...</>
            ) : (
              <>予約をリクエストする<Heart size={18} className="fill-white" /></>
            )}
          </button>
          <p className="text-[11px] text-gray-400 text-center">
            送信内容を確認後、はる・スタッフよりご連絡いたします。<br />この時点では予約は確定していません。
          </p>
        </form>
      </main>
    </div>
  );
}
