import { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
import { ja } from "date-fns/locale";
import { Loader2, Check, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * KEIKA 専用予約リクエストフォーム（スタンドアロン）。
 * 店舗DB（reservations / customers）とは連携せず、送信内容は
 * Edge Function notify-external-booking がメール通知＋external_bookings に記録する。
 */

const COURSES = [
  { minutes: 60, price: 25000 },
  { minutes: 90, price: 31000 },
  { minutes: 120, price: 37000 },
];

const FULL_PACKAGE_PRICE = 12000;

// 30分刻みの希望時間候補（12:00〜25:00、24時以降は表示のみ拡張表記）
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 12 * 60; m <= 25 * 60; m += 30) {
    out.push(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

export default function KeikaBooking() {
  const [date, setDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [time, setTime] = useState("");
  const [minutes, setMinutes] = useState(90);
  const [fullPackage, setFullPackage] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { document.title = "KEIKA｜予約リクエスト"; }, []);

  const course = COURSES.find((c) => c.minutes === minutes)!;
  const total = course.price + (fullPackage ? FULL_PACKAGE_PRICE : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("お名前を入力してください"); return; }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) { setError("電話番号を入力してください"); return; }
    if (!time) { setError("希望時間を選んでください"); return; }

    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("notify-external-booking", {
        body: {
          form_slug: "keika",
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          requested_date: date,
          requested_time: time,
          course: `${minutes}分コース（¥${course.price.toLocaleString()}）`,
          options: fullPackage ? [`FULL PACKAGE（¥${FULL_PACKAGE_PRICE.toLocaleString()}）`] : [],
          total_price: total,
          notes: notes.trim() || undefined,
        },
      });
      if (fnError || !(data as any)?.success) throw fnError ?? new Error("failed");
      setDone(true);
    } catch (err) {
      console.error(err);
      setError("送信に失敗しました。お手数ですがもう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  // KEIKAメニュー画像の雰囲気（大理石×黒）に合わせた配色
  const bg = { background: "linear-gradient(160deg, #f4e9e4 0%, #efe0d8 35%, #f3ebe2 70%, #ece0d4 100%)" };
  const serif = { fontFamily: "'Noto Serif JP', 'Times New Roman', serif" };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5" style={bg}>
        <div className="max-w-sm w-full text-center bg-white/80 backdrop-blur rounded-2xl shadow-xl p-8 space-y-5 border border-[#d8c4b6]">
          <div className="mx-auto w-16 h-16 rounded-full bg-[#2b2b2b] flex items-center justify-center">
            <Check className="text-white" size={32} />
          </div>
          <h1 className="text-xl font-bold text-[#2b2b2b] tracking-widest" style={serif}>送信完了</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            ご予約リクエストありがとうございます。<br />
            内容を確認のうえ、KEIKAよりご連絡いたします。
          </p>
          <div className="bg-[#f6efe9] rounded-xl p-4 text-sm text-left space-y-1 text-gray-700">
            <p>📅 {format(new Date(`${date}T00:00:00`), "M月d日(E)", { locale: ja })} {time}〜</p>
            <p>💆 {minutes}分コース{fullPackage ? " ＋ FULL PACKAGE" : ""}</p>
            <p>💰 ¥{total.toLocaleString()}（目安）</p>
          </div>
          <p className="text-xs text-gray-400">※ この時点ではまだ予約は確定していません。返信をもって確定となります。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12" style={bg}>
      {/* ヘッダー */}
      <header className="text-center pt-12 pb-8 px-6">
        <p className="text-[10px] tracking-[0.5em] text-[#8a7364] mb-3">RESERVATION</p>
        <h1 className="text-5xl font-bold text-[#1f1f1f] tracking-[0.15em]" style={serif}>
          KEIKA
        </h1>
        <div className="mx-auto mt-4 w-16 border-t border-[#1f1f1f]/40" />
        <p className="mt-4 text-sm text-[#6d5b4d]">予約リクエストフォーム</p>
      </header>

      <main className="max-w-md mx-auto px-5">
        <form onSubmit={handleSubmit} className="bg-white/75 backdrop-blur rounded-2xl shadow-lg border border-[#d8c4b6] p-6 space-y-7">
          {/* コース */}
          <div>
            <label className="block text-xs font-bold tracking-[0.2em] text-[#2b2b2b] mb-3" style={serif}>COURSE</label>
            <div className="space-y-2">
              {COURSES.map((c) => {
                const on = minutes === c.minutes;
                return (
                  <button
                    key={c.minutes}
                    type="button"
                    onClick={() => setMinutes(c.minutes)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                      on
                        ? "bg-[#2b2b2b] text-white border-[#2b2b2b] shadow-md"
                        : "bg-white/60 text-[#2b2b2b] border-[#d8c4b6] hover:bg-white"
                    }`}
                  >
                    <span className="font-semibold tracking-wider">{c.minutes}min</span>
                    <span className="font-bold tabular-nums">¥{c.price.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* オプション */}
          <div>
            <label className="block text-xs font-bold tracking-[0.2em] text-[#2b2b2b] mb-3" style={serif}>OPTION</label>
            <button
              type="button"
              onClick={() => setFullPackage((v) => !v)}
              className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                fullPackage
                  ? "bg-[#2b2b2b] text-white border-[#2b2b2b] shadow-md"
                  : "bg-white/60 text-[#2b2b2b] border-[#d8c4b6] hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold tracking-wider">FULL PACKAGE</span>
                <span className="font-bold tabular-nums">+¥{FULL_PACKAGE_PRICE.toLocaleString()}</span>
              </div>
              <p className={`text-[11px] mt-1 ${fullPackage ? "text-white/80" : "text-gray-500"}`}>
                {fullPackage ? "✓ 選択中" : "タップで追加"}
              </p>
            </button>
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              ※ コース代金にオプションは含まれません。衣装チェンジ、パッケージなどをご注文の場合は別途オプション代金がかかります。
            </p>
          </div>

          {/* 希望日 */}
          <div>
            <label className="block text-xs font-bold tracking-[0.2em] text-[#2b2b2b] mb-2" style={serif}>DATE</label>
            <div className="relative">
              <CalendarDays size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a7364] pointer-events-none z-10" />
              <input
                type="date"
                value={date}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full appearance-none rounded-xl border border-[#d8c4b6] bg-white/60 pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-[#2b2b2b] [color-scheme:light]"
              />
            </div>
          </div>

          {/* 希望時間 */}
          <div>
            <label className="block text-xs font-bold tracking-[0.2em] text-[#2b2b2b] mb-2" style={serif}>TIME</label>
            <div className="grid grid-cols-4 gap-1.5">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTime(t)}
                  className={`py-2 rounded-lg text-sm transition-all tabular-nums ${
                    time === t
                      ? "bg-[#2b2b2b] text-white shadow-md"
                      : "bg-white/60 text-[#5b4a3e] border border-[#d8c4b6] hover:bg-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">※ 細かい時間はひとこと欄でご相談ください</p>
          </div>

          {/* お名前・電話番号 */}
          <div>
            <label className="block text-xs font-bold tracking-[0.2em] text-[#2b2b2b] mb-2" style={serif}>NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="お名前"
              className="w-full rounded-xl border border-[#d8c4b6] bg-white/60 px-4 py-3 text-sm focus:outline-none focus:border-[#2b2b2b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold tracking-[0.2em] text-[#2b2b2b] mb-2" style={serif}>TEL</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="090-1234-5678"
              className="w-full rounded-xl border border-[#d8c4b6] bg-white/60 px-4 py-3 text-sm focus:outline-none focus:border-[#2b2b2b]"
            />
          </div>

          {/* ひとこと */}
          <div>
            <label className="block text-xs font-bold tracking-[0.2em] text-[#2b2b2b] mb-2" style={serif}>MESSAGE</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="ご希望・ご相談があればどうぞ"
              className="w-full rounded-xl border border-[#d8c4b6] bg-white/60 px-4 py-3 text-sm focus:outline-none focus:border-[#2b2b2b] resize-none"
            />
          </div>

          {/* 合計 */}
          <div className="flex items-center justify-between rounded-xl bg-[#f2e7de] border border-[#d8c4b6] px-4 py-3.5">
            <span className="text-sm font-bold text-[#2b2b2b] tracking-wider" style={serif}>TOTAL</span>
            <span className="text-2xl font-bold text-[#2b2b2b] tabular-nums" style={serif}>¥{total.toLocaleString()}</span>
          </div>

          {error && <p className="text-sm text-rose-600 text-center font-medium">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-xl bg-[#1f1f1f] text-white font-bold tracking-[0.3em] text-sm shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={serif}
          >
            {submitting ? (
              <><Loader2 size={16} className="animate-spin" />送信中...</>
            ) : (
              "リクエストを送信"
            )}
          </button>
          <p className="text-[11px] text-gray-400 text-center leading-relaxed">
            送信内容を確認後、KEIKAよりご連絡いたします。<br />この時点では予約は確定していません。
          </p>
        </form>
      </main>
    </div>
  );
}
