import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfDay } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";

interface Shift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: string;
  cast_id: string;
  room: string | null;
  notes: string | null;
  casts: {
    name: string;
    photo: string | null;
    type: string;
    status: string;
    age: number | null;
    height: number | null;
    cup_size: string | null;
    tags: string[] | null;
    message: string | null;
    x_account: string | null;
  };
}

interface Reservation {
  cast_id: string;
  start_time: string;
  duration: number;
}

const VISIBLE_DAYS = 7;

const Schedule = () => {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [stripStart, setStripStart] = useState<Date>(startOfDay(new Date()));

  useEffect(() => {
    document.title = "出勤情報｜全力エステ 仙台店";
  }, []);

  useEffect(() => {
    fetchData();
    const ch1 = supabase
      .channel("public-shifts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => fetchData())
      .subscribe();
    const ch2 = supabase
      .channel("public-reservations-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => fetchData())
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [selectedDate]);

  const fetchData = async () => {
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const [s, r] = await Promise.all([
        supabase
          .from("shifts")
          .select(
            `*, casts (name, photo, type, status, age, height, cup_size, tags, message, x_account)`
          )
          .eq("shift_date", dateStr)
          .order("start_time", { ascending: true }),
        supabase.rpc("get_reservation_slots", { p_date: dateStr, p_cast_id: null }),
      ]);
      if (s.error) throw s.error;
      const grouped = (s.data || []).reduce((acc: Record<string, Shift>, sh: any) => {
        if (sh.casts?.is_visible !== false) {
          if (!acc[sh.cast_id]) acc[sh.cast_id] = sh as Shift;
        }
        return acc;
      }, {});
      setShifts(Object.values(grouped));
      setReservations(((r.data as any[]) || []).map((x) => ({
        cast_id: x.cast_id,
        start_time: x.start_time,
        duration: x.duration,
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const stripDays = useMemo(
    () => Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(stripStart, i)),
    [stripStart]
  );

  // Compute next available slot for each cast (after current real time on that day)
  const nextAvailable = (shift: Shift): string | null => {
    const now = new Date();
    const isToday =
      format(selectedDate, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
    const [sh, sm] = shift.start_time.split(":").map(Number);
    const [eh, em] = shift.end_time.split(":").map(Number);
    let cursor = sh * 60 + sm;
    const end = eh * 60 + em;
    if (isToday) {
      const cur = now.getHours() * 60 + now.getMinutes();
      if (cur > cursor) cursor = Math.ceil(cur / 30) * 30;
    }
    // skip over reserved blocks (60m + 30m buffer)
    const reserved = reservations
      .filter((r) => r.cast_id === shift.cast_id)
      .map((r) => {
        const [h, m] = r.start_time.split(":").map(Number);
        const start = h * 60 + m;
        return { start, end: start + r.duration + 30 };
      });
    while (cursor + 60 <= end) {
      const conflict = reserved.find(
        (b) => cursor < b.end && cursor + 60 > b.start
      );
      if (!conflict) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
        const mm = String(cursor % 60).padStart(2, "0");
        return `${hh}:${mm}`;
      }
      cursor = conflict.end;
    }
    return null;
  };

  const handleBook = (castId: string, time: string) => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    navigate(`/booking?castId=${castId}&date=${dateStr}&time=${time}`);
  };

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "#f8f6f3" }}>
      <PublicNavigation />

      {/* Section Heading */}
      <div className="text-center pt-5 md:pt-10 pb-4 md:pb-6">
        <h1
          className="text-2xl md:text-4xl tracking-[0.3em] font-light"
          style={{ color: "#3a3a4a" }}
        >
          SCHEDULE
        </h1>
        <p className="mt-1 text-xs md:text-sm tracking-widest text-[#7a706c]">出勤情報</p>
      </div>

      {/* Date Strip - 公式と同じ横ストリップ */}
      <div className="container mx-auto max-w-3xl px-4">
        <div className="bg-white rounded shadow-sm border border-[#e5d5cc] flex items-stretch overflow-hidden">
          <button
            aria-label="前へ"
            onClick={() => setStripStart(addDays(stripStart, -VISIBLE_DAYS))}
            className="px-2 text-[#7a706c] hover:bg-[#f2e4de] border-r border-[#e5d5cc]"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex flex-1">
            {stripDays.map((d) => {
              const isSel =
                format(d, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
              const dow = format(d, "E", { locale: ja });
              const isSat = d.getDay() === 6;
              const isSun = d.getDay() === 0;
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDate(d)}
                  className={`flex-1 py-2 text-center transition-colors ${
                    isSel
                      ? "bg-[#1c1f3a] text-white"
                      : "bg-white hover:bg-[#f2e4de]"
                  }`}
                >
                  <div
                    className={`text-base md:text-lg font-semibold ${
                      isSel
                        ? "text-white"
                        : isSun
                        ? "text-red-500"
                        : isSat
                        ? "text-blue-500"
                        : "text-[#3a3a4a]"
                    }`}
                  >
                    {d.getDate()}
                  </div>
                  <div
                    className={`text-[10px] ${
                      isSel
                        ? "text-white/80"
                        : isSun
                        ? "text-red-400"
                        : isSat
                        ? "text-blue-400"
                        : "text-[#7a706c]"
                    }`}
                  >
                    {dow}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            aria-label="次へ"
            onClick={() => setStripStart(addDays(stripStart, VISIBLE_DAYS))}
            className="px-2 text-[#7a706c] hover:bg-[#f2e4de] border-l border-[#e5d5cc]"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Cards Grid - 公式準拠の縦長カード */}
      <main className="container mx-auto max-w-5xl px-4 py-8">
        {loading ? (
          <p className="text-center text-[#7a706c]">読み込み中...</p>
        ) : shifts.length === 0 ? (
          <div className="text-center py-16 text-[#7a706c]">
            この日の出勤予定はありません
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {shifts.map((shift) => {
              const next = nextAvailable(shift);
              return (
                <div
                  key={shift.id}
                  className="bg-white rounded shadow-sm border border-[#e5d5cc] overflow-hidden flex flex-col"
                >
                  {/* Photo with X icon overlay & next time */}
                  <div className="relative aspect-[3/4] bg-[#f2e4de]">
                    {shift.casts.photo ? (
                      <img
                        src={shift.casts.photo}
                        alt={shift.casts.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl text-[#d4b5a8]">
                        {shift.casts.name.charAt(0)}
                      </div>
                    )}
                    {shift.casts.x_account && (
                      <a
                        href={
                          shift.casts.x_account.startsWith("http")
                            ? shift.casts.x_account
                            : `https://twitter.com/${shift.casts.x_account.replace(/^@/, "")}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-1.5 right-1.5 bg-black/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold"
                        aria-label="X"
                      >
                        𝕏
                      </a>
                    )}
                    {next && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-center py-1 text-xs font-semibold">
                        次回 {next}
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                    <h3
                      className="text-center font-bold text-sm md:text-base"
                      style={{ color: "#7a706c" }}
                    >
                      🌱{shift.casts.name}
                    </h3>
                    {shift.casts.message && (
                      <p className="text-[11px] text-[#1a1817] text-center line-clamp-2 leading-tight">
                        {shift.casts.message}
                      </p>
                    )}
                    <p className="text-[11px] text-center text-[#7a706c]">
                      {shift.casts.age && `${shift.casts.age}歳`}
                      {shift.casts.height && ` ${shift.casts.height}㎝`}
                      {shift.casts.cup_size && ` (${shift.casts.cup_size})`}
                    </p>

                    {shift.casts.tags && shift.casts.tags.filter(t => !["在籍","出稼ぎ","入店手続き待ち"].includes(t)).length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1">
                        {shift.casts.tags.filter(t => !["在籍","出稼ぎ","入店手続き待ち"].includes(t)).slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="text-[9px] px-1.5 py-0.5 border border-[#c49480]/50 text-[#7a706c] rounded bg-[#fdf6f1]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-[11px] text-center text-[#1a1817] mt-auto pt-1">
                      🕐 {shift.start_time.substring(0, 5)}〜
                      {shift.end_time.substring(0, 5)}
                    </div>
                    {shift.room && (
                      <div className="text-[11px] text-center text-[#7a706c] inline-flex items-center justify-center gap-0.5">
                        <MapPin size={10} />■{shift.room}■
                      </div>
                    )}

                    {next ? (
                      <button
                        onClick={() => handleBook(shift.cast_id, next)}
                        className="mt-1 w-full py-1.5 bg-[#c49480] hover:bg-[#a87b65] text-white text-xs font-semibold rounded tracking-wider"
                      >
                        予 約
                      </button>
                    ) : (
                      <div className="mt-1 w-full py-1.5 bg-gray-300 text-white text-xs text-center font-semibold rounded">
                        満 了
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
};

export default Schedule;
