import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PublicNavigation } from "@/components/public/PublicNavigation";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FixedBottomBar } from "@/components/public/FixedBottomBar";
import { driveImgUrl } from "@/lib/drive";
import { useStore } from "@/hooks/useStore";
import { CastTitleBadge, useTitleBadges } from "@/components/public/CastTitleBadge";
import { ESTAMA_CAST_PHOTO_STYLE } from "@/lib/publicCastPhoto";
import { trackPublicEvent } from "@/lib/publicAnalytics";

interface Cast {
  id: string;
  name: string;
  age: number | null;
  height: number | null;
  bust: number | null;
  cup_size: string | null;
  waist: number | null;
  hip: number | null;
  type: string;
  status: string;
  photo: string | null;
  photos: string[] | null;
  title_badge_id?: string | null;
  tags: string[] | null;
  join_date: string;
  profile: string | null;
  x_account: string | null;
  line_url: string | null;
  litlink_url: string | null;
  o2_url: string | null;
  estama_profile_url: string | null;
  instagram_url: string | null;
  blog_url: string | null;
  skebiy_url: string | null;
  custom_fields: Record<string, string> | null;
}

const INTERNAL_TAGS = [
  "在籍", "出稼ぎ", "入店手続き待ち",
  "ノーステータス", "入店手続き---面談予定", "入店手続き---講習予定",
  "ビギナーズ", "スタンダード", "ソルジャー", "マスター",
];

const Casts = () => {
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'today' | 'newface'>('all');
  const [todayShiftCastIds, setTodayShiftCastIds] = useState<Set<string>>(new Set());
  const { storeId, loading: storeLoading } = useStore();

  useEffect(() => {
    document.title = `${storeName} - セラピスト`;
  }, []);

  useEffect(() => {
    if (storeLoading) return;
    fetchCasts();
    fetchTodayShifts();
    const castsChannel = supabase
      .channel('public-casts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casts' }, () => fetchCasts())
      .subscribe();
    const shiftsChannel = supabase
      .channel('public-shifts-today')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => fetchTodayShifts())
      .subscribe();
    return () => {
      supabase.removeChannel(castsChannel);
      supabase.removeChannel(shiftsChannel);
    };
  }, [storeLoading, storeId]);

  const fetchCasts = async () => {
    try {
      const { data, error } = await supabase
        .from("casts")
        .select("id,name,age,height,bust,cup_size,waist,hip,type,status,photo,photos,title_badge_id,tags,join_date,profile,x_account,line_url,litlink_url,o2_url,estama_profile_url,instagram_url,blog_url,skebiy_url,custom_fields")
        .eq("is_active", true)
        .eq("is_visible", true)
        .eq("store_id", storeId)
        .order("name", { ascending: true });
      if (error) throw error;
      setCasts(data || []);
    } catch (error) {
      console.error("Error fetching casts:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTodayShifts = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("shifts")
      .select("cast_id")
      .eq("shift_date", today)
      .eq("store_id", storeId);
    setTodayShiftCastIds(new Set((data || []).map((shift: { cast_id: string }) => shift.cast_id)));
  };

  const isNewFace = (joinDate: string) => {
    const join = new Date(joinDate);
    const now = new Date();
    return Math.ceil(Math.abs(now.getTime() - join.getTime()) / (1000 * 60 * 60 * 24)) <= 30;
  };

  const titleBadgeMap = useTitleBadges();
  const { store } = useStore();
  const storeName = store?.name ?? "艶華";

  const filteredCasts = casts.filter((cast) => {
    if (filter === 'today') return todayShiftCastIds.has(cast.id);
    if (filter === 'newface') return isNewFace(cast.join_date);
    return true;
  });

  const formatSize = (cast: Cast) => {
    if (!cast.height) return '';
    let s = `T.${cast.height}`;
    if (cast.bust && cast.cup_size && cast.waist && cast.hip) s += ` B.${cast.bust}(${cast.cup_size}) W.${cast.waist} H.${cast.hip}`;
    else if (cast.bust && cast.waist && cast.hip) s += ` B.${cast.bust} W.${cast.waist} H.${cast.hip}`;
    return s;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-14 md:pb-0" style={{ backgroundColor: "var(--pub-bg,#0f0c09)" }}>
      <PublicNavigation />

      <main className="container py-4 md:py-8 px-3 md:px-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-lg md:text-2xl font-bold" style={{ color: "var(--pub-text,#f0e6d2)" }}>
              <small className="text-xs md:text-sm block mb-0.5 text-[var(--pub-text-muted,#a3987f)]">THERAPIST</small>
              艶華のセラピスト一覧
            </h1>
            <Link to="/schedule" onClick={() => trackPublicEvent("availability_view", { placement: "casts_heading" })} className="inline-block bg-[var(--pub-card,#1a150f)] hover:bg-[var(--pub-card2,#221b12)] text-[var(--pub-text,#f0e6d2)] border border-[var(--pub-accent,#c6a15b)] px-4 py-1.5 text-sm rounded transition-colors">
              出勤表はこちら
            </Link>
          </div>

          <div className="mb-4 md:mb-6 flex flex-wrap gap-2">
            {(['all', 'today', 'newface'] as const).map((f) => (
              <Button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`px-4 py-2 text-sm ${filter === f ? 'bg-[var(--pub-accent,#c6a15b)] hover:bg-[var(--pub-accent-deep,#a87c2a)] text-white' : 'bg-[var(--pub-card,#1a150f)] hover:bg-[var(--pub-card2,#221b12)] text-[var(--pub-text,#f0e6d2)] border border-[var(--pub-accent,#c6a15b)]'}`}
              >
                {f === 'all' ? 'すべて' : f === 'today' ? '本日出勤' : '新人'}
              </Button>
            ))}
          </div>

          {filteredCasts.length === 0 ? (
            <div className="text-center py-12"><p className="text-[var(--pub-text-muted,#a3987f)]">該当するセラピストが見つかりませんでした</p></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredCasts.map((cast) => {
                return (
                  <Link
                    key={cast.id}
                    to={`/casts/${cast.id}`}
                    className="relative block group"
                    aria-label={`${cast.name}のプロフィール・空き状況を見る`}
                    onClick={() => trackPublicEvent("cast_card_click", { placement: "casts_list", cast_id: cast.id, filter })}
                  >
                    <figure className="bg-[var(--pub-card,#1a150f)] rounded overflow-hidden shadow hover:shadow-lg transition-shadow">
                      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                        {cast.tags?.filter((tag) => !INTERNAL_TAGS.includes(tag)).slice(0, 3).map((tag, idx) => (
                          <span key={idx} className={`text-white text-xs font-bold px-2 py-1 rounded shadow-md ${tag === "人気セラピスト" ? "bg-red-500" : tag === "新人" ? "bg-pink-500" : "bg-blue-500"}`}>{tag}</span>
                        ))}
                      </div>
                      <div className="relative">
                        <div className="absolute top-2 right-2 z-10">
                          <CastTitleBadge badge={titleBadgeMap.get(cast.title_badge_id ?? "")} />
                        </div>
                        {cast.photo ? (
                          <img src={driveImgUrl(cast.photo)} alt={cast.name} loading="lazy" className="w-full object-cover group-hover:scale-105 transition-transform duration-500" style={ESTAMA_CAST_PHOTO_STYLE} />
                        ) : (
                          <div className="w-full bg-gradient-to-br from-[var(--pub-accent,#c6a15b)] to-[var(--pub-accent-deep,#a87c2a)] flex items-center justify-center" style={ESTAMA_CAST_PHOTO_STYLE}>
                            <span className="text-4xl text-white">{cast.name.charAt(0)}</span>
                          </div>
                        )}
                      </div>
                      <figcaption className="p-2 md:p-3">
                        <h2 className="font-bold text-[var(--pub-text,#f0e6d2)] text-sm leading-tight">{cast.name}{cast.age ? `(${cast.age})` : ""}</h2>
                        {formatSize(cast) && <p className="text-xs text-[var(--pub-text-muted,#a3987f)] mt-0.5 leading-tight">{formatSize(cast)}</p>}
                        <p className="mt-2 text-xs font-semibold" style={{ color: "var(--pub-accent,#c6a15b)" }}>プロフィール・空き状況を見る →</p>
                      </figcaption>
                    </figure>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <PublicFooter />
      <FixedBottomBar />
    </div>
  );
};

export default Casts;
