import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format, addDays } from "date-fns";
import { ja } from "date-fns/locale";
import { Heart, Sparkles, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/hooks/useStore";
import { driveImgUrl } from "@/lib/drive";

/**
 * セラピスト専用の予約リクエストフォーム（可愛いデザイン）。
 * /book/:castId で対象セラピストを特定。各セラピストがマイページから
 * 自分のリンクを発行して使う。送信された予約は status="pending" /
 * referral_source="<名前>専用フォーム" で reservations に登録され、
 * 管理画面の予約ボードにリクエストとしてストックされる。
 */

interface BackRate {
  course_type: string;
  duration: number;
  customer_price: number;
}

interface OptionRate {
  option_name: string;
  customer_price: number;
  display_order: number;
}

interface Cast {
  id: string;
  name: string;
  photo: string | null;
}

// 30分刻みの希望時間候補（13:00〜25:00）。深夜は24:00・24:30・25:00表記で表示し、
// 保存は「翌カレンダー日付＋実時刻（24:00→翌0:00 …）」に変換する（管理タイムラインと整合）。
const TIME_OPTIONS: { label: string; value: string; dayOffset: number }[] = (() => {
  const out: { label: string; value: string; dayOffset: number }[] = [];
  for (let m = 13 * 60; m <= 25 * 60; m += 30) {
    const dh = Math.floor(m / 60);
    const dm = m % 60;
    const label = `${dh}:${String(dm).padStart(2, "0")}`; // 表示（24:00〜28:00もそのまま）
    const real = m % (24 * 60);
    const rh = Math.floor(real / 60);
    const value = `${String(rh).padStart(2, "0")}:${String(dm).padStart(2, "0")}`; // 保存用の実時刻
    const dayOffset = m >= 24 * 60 ? 1 : 0; // 24:00以降は翌カレンダー日付
    out.push({ label, value, dayOffset });
  }
  return out;
})();

// オプションの内容説明（空文字の間は表示しない）
const OPTION_DESCRIPTIONS: Record<string, string> = {
  "全力PKG": "極液・DR30分・マイクロビキニが全てセットになったお得なパッケージ。\n迷ったらこれを入れておけば間違いナシです‼︎",
};

// おすすめオプション＆掲載順（延長20→延長40→全力PKG→DR30→衣装MB→極液→その他）
const OPTION_ORDER = ["延長20分", "延長40分", "全力PKG", "DR30分", "衣装MB", "極液"];
const RECOMMENDED = new Set(OPTION_ORDER);
const optionSortKey = (name: string) => {
  const i = OPTION_ORDER.indexOf(name);
  return i === -1 ? OPTION_ORDER.length : i;
};

export default function CastBooking() {
  const { castId } = useParams<{ castId: string }>();
  const { storeId } = useStore();
  const [cast, setCast] = useState<Cast | null>(null);
  const [castLoading, setCastLoading] = useState(true);
  const [backRates, setBackRates] = useState<BackRate[]>([]);
  const [optionRates, setOptionRates] = useState<OptionRate[]>([]);
  const [nominationFee, setNominationFee] = useState(0);

  const [date, setDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [time, setTime] = useState("");
  const [courseType, setCourseType] = useState("");
  const [duration, setDuration] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!castId) { setCastLoading(false); return; }
    supabase.from("casts").select("id, name, photo").eq("id", castId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCast(data as Cast);
          document.title = `${(data as Cast).name}｜専用予約ページ`;
        }
        setCastLoading(false);
      });
    supabase.rpc("get_public_back_rates").then(({ data }) => {
      const rates = (data || []) as BackRate[];
      setBackRates(rates);
      const aroma = rates.find((r) => r.course_type === "アロマオイル");
      if (aroma) setCourseType(aroma.course_type);
    });
    supabase.from("option_rates").select("option_name, customer_price, display_order")
      .order("display_order").then(({ data }) => {
        setOptionRates((data || []) as OptionRate[]);
      });
    supabase.from("nomination_rates").select("nomination_type, customer_price").then(({ data }) => {
      const net = (data || []).find((n: any) => n.nomination_type === "ネット指名");
      if (net) setNominationFee(net.customer_price ?? 0);
    });
  }, [castId]);

  const courseTypes = [...new Set(backRates.map((r) => r.course_type))];
  const durationsFor = (ct: string) =>
    backRates.filter((r) => r.course_type === ct).sort((a, b) => a.duration - b.duration);

  const toggleOption = (name: string) =>
    setSelectedOptions((prev) => prev.includes(name) ? prev.filter((o) => o !== name) : [...prev, name]);

  const coursePrice = backRates.find(
    (r) => r.course_type === courseType && r.duration === duration
  )?.customer_price ?? 0;
  const optionsTotal = selectedOptions.reduce(
    (s, name) => s + (optionRates.find((o) => o.option_name === name)?.customer_price ?? 0), 0
  );
  const total = coursePrice > 0 ? coursePrice + optionsTotal + nominationFee : 0;

  const selectedTime = TIME_OPTIONS.find((t) => t.value === time);
  // 24:00以降は翌カレンダー日付で保存（管理タイムラインの営業日ロジックと整合）
  const resDate = selectedTime
    ? format(addDays(new Date(`${date}T00:00:00`), selectedTime.dayOffset), "yyyy-MM-dd")
    : date;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!cast) return;
    if (!name.trim()) { setError("お名前を入力してね"); return; }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) { setError("電話番号を入力してね"); return; }
    if (!date) { setError("希望日を選んでね"); return; }
    if (!time) { setError("希望時間を選んでね"); return; }
    if (!courseType || !duration) { setError("コースを選んでね"); return; }

    setSubmitting(true);
    try {
      const courseName = `${courseType} ${duration}分`;
      const { error: insErr } = await supabase.from("reservations").insert([{
        cast_id: cast.id,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        reservation_date: resDate,
        start_time: time,
        duration,
        course_type: courseType,
        course_name: courseName,
        options: selectedOptions.length > 0 ? selectedOptions : null,
        nomination_type: "ネット指名",
        price: total,
        payment_method: "現金",
        notes: notes.trim() || null,
        referral_source: `${cast.name}専用フォーム`,
        status: "confirmed",
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
            cast_name: cast.name,
            reservation_date: dateStr,
            start_time: selectedTime?.label ?? time,
            course_name: courseName,
            options: selectedOptions.length > 0 ? selectedOptions : null,
            nomination_type: "ネット指名",
            price: total,
            payment_method: "現金",
            notes: `【${cast.name}専用フォーム】${notes.trim()}`,
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

  if (castLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-100 via-rose-50 to-white flex items-center justify-center">
        <Loader2 className="animate-spin text-rose-400" size={32} />
      </div>
    );
  }

  if (!cast) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-100 via-rose-50 to-white flex items-center justify-center p-5">
        <p className="text-rose-500 font-medium text-center">予約ページが見つかりませんでした。<br />リンクをご確認ください。</p>
      </div>
    );
  }

  const photoUrl = driveImgUrl(cast.photo, 400);

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
            内容を確認して、<span className="font-bold text-rose-500">{cast.name}</span>または<br />スタッフよりご連絡いたします💌
          </p>
          <div className="bg-pink-50 rounded-2xl p-4 text-sm text-left space-y-1 text-gray-700">
            <p>📅 {format(new Date(`${date}T00:00:00`), "M月d日(E)", { locale: ja })} {selectedTime?.label ?? time}〜</p>
            <p>💆 {courseType} {duration}分</p>
            {selectedOptions.length > 0 && <p>✨ {selectedOptions.join("・")}</p>}
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
            {photoUrl ? (
              <img src={photoUrl} alt={cast.name} className="w-full h-full rounded-full object-cover object-top border-2 border-white" />
            ) : (
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center border-2 border-white">
                <Heart className="text-rose-300 fill-rose-200" size={40} />
              </div>
            )}
          </div>
          <h1 className="mt-4 text-2xl font-bold text-rose-500 tracking-wide">
            {cast.name}<span className="text-base font-medium text-pink-400"> 専用予約ページ</span>
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
            <div className="grid grid-cols-4 gap-2">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setTime(t.value)}
                  className={`py-2 rounded-xl text-sm font-medium transition-all ${
                    time === t.value
                      ? "bg-gradient-to-br from-pink-400 to-rose-400 text-white shadow-md scale-105"
                      : "bg-pink-50 text-rose-400 hover:bg-pink-100"
                  }`}
                >
                  {t.label}
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
                  {r.duration}分<br />¥{(r.customer_price + nominationFee).toLocaleString()}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">※ 料金はすべて指名料込みです</p>
          </div>

          {/* オプション（延長含む） */}
          {optionRates.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-bold text-rose-500 mb-2">
                <Heart size={14} className="fill-rose-300 text-rose-300" />オプション（延長など・任意）
              </label>
              <div className="flex flex-wrap gap-2">
                {[...optionRates]
                  .sort((a, b) => optionSortKey(a.option_name) - optionSortKey(b.option_name) || a.display_order - b.display_order)
                  .map((o) => {
                  const on = selectedOptions.includes(o.option_name);
                  const recommended = RECOMMENDED.has(o.option_name);
                  return (
                    <button
                      key={o.option_name}
                      type="button"
                      onClick={() => toggleOption(o.option_name)}
                      className={`relative px-3 py-2 rounded-full text-xs font-medium transition-all ${
                        on
                          ? "bg-gradient-to-br from-pink-400 to-rose-400 text-white shadow-md scale-105"
                          : recommended
                            ? "bg-rose-50 text-rose-500 ring-1 ring-rose-200 hover:bg-rose-100"
                            : "bg-pink-50 text-rose-400 hover:bg-pink-100"
                      }`}
                    >
                      {recommended && (
                        <span className={`mr-1 ${on ? "text-yellow-200" : "text-rose-400"}`}>⭐</span>
                      )}
                      {o.option_name} +¥{o.customer_price.toLocaleString()}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">⭐ はおすすめオプション♡ ご希望があればタップしてね</p>

              {/* 全力PKG の内容説明 */}
              {optionRates.some((o) => o.option_name === "全力PKG") && OPTION_DESCRIPTIONS["全力PKG"] && (
                <div className="mt-3 rounded-xl bg-rose-50 border border-rose-100 p-3">
                  <p className="text-xs font-bold text-rose-500 mb-1">⭐ 全力PKGとは？</p>
                  <p className="text-[11px] text-gray-600 whitespace-pre-wrap leading-relaxed">{OPTION_DESCRIPTIONS["全力PKG"]}</p>
                </div>
              )}
            </div>
          )}

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
              <Heart size={14} className="fill-rose-300 text-rose-300" />{cast.name}へひとこと（任意）
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
            送信内容を確認後、{cast.name}・スタッフよりご連絡いたします。<br />この時点では予約は確定していません。
          </p>
        </form>
      </main>
    </div>
  );
}
