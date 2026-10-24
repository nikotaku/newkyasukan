import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStore } from "@/hooks/useStore";
import { useAdminStore } from "@/hooks/useAdminStore";
import { MISC_FEE_DAILY_CAP, MISC_FEE_PER_SESSION, DEKASEGI_ACCOMMODATION_PER_DAY } from "@/lib/clearanceDefaults";
import { SIGNATURE_COURSE, SIGNATURE_OPTION, type SystemItem, signatureCombo, systemItem } from "@/lib/interviewSystem";
import simultaneousPostSystemImage from "@/assets/recruit/enka-simultaneous-post-system.png";
import {
  ArrowLeft, MapPin, Clock, Train, ShieldCheck,
  Home, IdCard, Camera, AlertTriangle, Sparkles, Check, ChevronDown,
  Footprints, Tablet, Share2, Loader2, Smartphone, CalendarPlus, Calendar, Crown, Wallet, ListChecks,
  Bell, Send, Receipt, LogOut, Users, PencilLine, ImagePlus, AtSign, DoorOpen, Trophy, Plane, BarChart3,
  ImageIcon, Megaphone, type LucideIcon,
} from "lucide-react";

// セラピストポータル（マイページ）でできること。マイページのメニューと同じ並び・同じ名前で書く
const PORTAL_FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Bell, title: "予約の通知", body: "予約が入った・変わった・キャンセルになったら、すぐスマホに届きます（開始時刻・コース・お客様・決済方法など）" },
  { icon: CalendarPlus, title: "シフト提出", body: "出勤したい日をカレンダーから選んで提出" },
  { icon: Calendar, title: "シフト確認・事前予約", body: "確定したシフトと出勤ルーム、今日以降の予約を確認" },
  { icon: DoorOpen, title: "入室方法", body: "ルームまでの道順・鍵の開け方（動画・写真）・Wi-Fi" },
  { icon: LogOut, title: "退勤フォーム（精算）", body: "売上・清掃チェックを入れて送るだけ。お店が承認すると清算明細が届きます" },
  { icon: Receipt, title: "バック表", body: "コース・オプション・指名ごとのお給料をいつでも確認" },
  { icon: BarChart3, title: "その月の本数", body: "施術済み・予定の本数、指名の内訳を月ごとに確認" },
  { icon: Users, title: "顧客カルテ", body: "担当したお客様の好み・NG・来店履歴" },
  { icon: Send, title: "2媒体投稿", body: "写真1枚と文章で、HP・O2・魂セラピストへ同時に投稿" },
  { icon: Trophy, title: "集客ミッション", body: "投稿などのミッションを達成してポイントを貯める" },
  { icon: PencilLine, title: "プロフィール入力", body: "HPに載るプロフィールを自分で入力してお店に送る" },
  { icon: ImagePlus, title: "画像アップロード", body: "プロフィール・宣伝用の写真をお店に送る（HPに載せる写真はお店が選びます）" },
  { icon: Megaphone, title: "お知らせ", body: "お店からの連絡・注意事項（清掃・シフト提出のお願いなど）。読んだら「確認しました」" },
  { icon: ImageIcon, title: "写真の確認", body: "お店が加工した写真を見て、1枚ずつOK・直してほしいを返事" },
  { icon: AtSign, title: "SNSアカウント", body: "お店が用意したX・O2のログイン情報と設定マニュアル" },
  { icon: Plane, title: "交通費申請", body: "交通費の申請と申請履歴の確認" },
];

const PORTAL_STEPS: { title: string; body: string }[] = [
  { title: "専用URLを開く", body: "勤務が決まったら、あなた専用のマイページのURLをLINEでお送りします。ログインやパスワードはいりません（URLは人に教えないでください）" },
  { title: "ホーム画面に追加", body: "iPhoneはSafariで開いて「共有」→「ホーム画面に追加」。AndroidはChromeのメニュー→「ホーム画面に追加」。アプリのように開けます" },
  { title: "通知をオンにする", body: "ホーム画面のアイコンから開いて「通知をオンにする」→ テスト通知が届けば準備完了。予約のお知らせはここに届きます" },
  { title: "出勤日の流れ", body: "入室方法を見てルームへ → 予約の通知を確認 → 退勤時に「退勤フォーム」で売上を送信 → お店が承認すると清算明細が届きます" },
];

// 面談の最後に説明する「今後の流れ」（勤務が決まってから最初の出勤まで）
const NEXT_STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Smartphone, title: "マイページを準備する", body: "専用のマイページのURLをお送りします。ホーム画面に追加して「通知をオンにする」まで済ませてください" },
  { icon: PencilLine, title: "プロフィール項目の入力", body: "マイページの「プロフィール入力」で、HPに載るプロフィール（タイプ・趣味・好きなことなど）を入力してお店に送ります" },
  { icon: ImagePlus, title: "パネル写真のアップロード", body: "マイページの「画像アップロード」から、パネル（プロフィール）用の写真を送ります。HPに載せる写真と加工はお店が行います" },
  { icon: AtSign, title: "SNSアカウント（X・O2）の作成", body: "X・O2のアカウントはお店が作ります。準備ができたらマイページに通知が届くので、「SNSアカウント」でログイン情報と設定マニュアルを見て初期設定をします" },
];

/**
 * 面談用（画面共有）ページ。ビデオ通話で候補者に画面共有しながら、
 * 店舗詳細・ルーム環境・注意点を説明する面談資料。
 * 施術マニュアルと店舗詳細をもとに構成。縦スクロール・大きめ文字で見やすく。
 */

export default function InterviewGuide() {
  const navigate = useNavigate();
  // ?type=zaiseki は在籍用（出稼ぎ向けの「12時間勤務」を出さない）。それ以外は出稼ぎ用
  const [searchParams] = useSearchParams();
  const isResident = searchParams.get("type") === "zaiseki";

  useEffect(() => {
    document.title = "艶華｜面談資料";
  }, []);

  // バック表（マイページの「バック表」と同じもの）。ログイン中は自分の店舗、そうでなければ開いているサイトの店舗
  const { user, loading: authLoading } = useAuth();
  const { storeId: siteStoreId, loading: siteStoreLoading } = useStore();
  const { storeId: adminStoreId, loading: adminStoreLoading } = useAdminStore();
  const backRateStoreId = authLoading
    ? null
    : user
      ? (adminStoreLoading ? null : adminStoreId)
      : (siteStoreLoading ? null : siteStoreId);
  // 料金・報酬システム：コース・オプション・指名ごとに、お客様の料金・バック・店落ち（今お客様に出しているものだけ）
  const [system, setSystem] = useState<{
    courses: SystemItem[];
    options: SystemItem[];
    nominations: SystemItem[];
  } | null>(null);
  useEffect(() => {
    if (!backRateStoreId) return;
    let active = true;
    Promise.all([
      supabase
        .from("back_rates")
        .select("course_type, duration, customer_price, therapist_back, is_visible, description")
        .eq("store_id", backRateStoreId)
        .order("display_order")
        .order("duration"),
      supabase
        .from("option_rates")
        .select("id, option_name, customer_price, therapist_back, is_visible")
        .eq("store_id", backRateStoreId)
        .order("display_order")
        .order("option_name"),
      supabase
        .from("nomination_rates")
        .select("id, nomination_type, customer_price, therapist_back")
        .eq("store_id", backRateStoreId)
        .order("customer_price")
        .order("nomination_type"),
    ]).then(([courses, options, nominations]) => {
      if (!active) return;
      const error = courses.error || options.error || nominations.error;
      if (error) console.error("料金表を読めませんでした", error);
      setSystem({
        courses: (courses.data ?? [])
          .filter((row) => row.is_visible !== false)
          .map((row) => systemItem(`${row.course_type}-${row.duration}`, `${row.course_type} ${row.duration}分`, row.customer_price, row.therapist_back, row.description)),
        options: (options.data ?? [])
          .filter((row) => row.is_visible !== false)
          .map((row) => systemItem(row.id, row.option_name, row.customer_price, row.therapist_back)),
        nominations: (nominations.data ?? []).map((row) => systemItem(row.id, row.nomination_type, row.customer_price, row.therapist_back)),
      });
    });
    return () => { active = false; };
  }, [backRateStoreId]);

  const signature = system
    ? signatureCombo(
      system.courses.find((row) => row.key === `${SIGNATURE_COURSE.course_type}-${SIGNATURE_COURSE.duration}`),
      system.options.find((row) => row.label === SIGNATURE_OPTION),
    )
    : null;
  const estamaPlans = system?.courses.filter((row) => row.label.startsWith("エスたま限定")) ?? [];
  const yen = (n: number) => `¥${n.toLocaleString()}`;

  const Section = ({ id, icon: Icon, title, sub, children, tone = "rose", wide = false }: {
    id?: string; icon: LucideIcon; title: string; sub?: string; children: React.ReactNode;
    tone?: "rose" | "amber" | "gray"; wide?: boolean;
  }) => {
    const toneMap: Record<string, string> = {
      rose: "from-rose-500 to-pink-500",
      amber: "from-amber-500 to-orange-500",
      gray: "from-gray-600 to-gray-700",
    };
    return (
      <section id={id} className="px-5 py-10 border-b border-gray-100">
        <div className={`${wide ? "max-w-[965px]" : "max-w-xl"} mx-auto`}>
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${toneMap[tone]} flex items-center justify-center shrink-0 shadow-sm`}>
              <Icon size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 leading-tight">{title}</h2>
              {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
          </div>
          {children}
        </div>
      </section>
    );
  };

  // key-value 行
  const KV = ({ k, v, hl }: { k: string; v: React.ReactNode; hl?: boolean }) => (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 shrink-0">{k}</span>
      <span className={`text-sm text-right ${hl ? "font-bold text-rose-600" : "font-medium text-gray-800"}`}>{v}</span>
    </div>
  );

  const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 ${className}`}>{children}</div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <button
        onClick={() => navigate("/")}
        className="fixed top-3 left-3 z-50 flex items-center gap-1 text-xs bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow text-gray-500 hover:text-gray-800 print:hidden"
      >
        <ArrowLeft size={13} /> 店舗サイトへ
      </button>

      {/* HERO */}
      <section className="relative min-h-[70vh] flex flex-col items-center justify-center text-center px-6 bg-gradient-to-br from-gray-900 via-rose-900 to-gray-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <Sparkles className="absolute top-16 left-10" size={40} />
          <Sparkles className="absolute bottom-24 right-12" size={32} />
        </div>
        <div className="relative">
          <p className="text-xs tracking-[0.4em] text-rose-300 mb-4">ENKA SENDAI</p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">艶華</h1>
          <p className="text-sm text-gray-300 mb-8">メンズエステ｜面談資料</p>
          <p className="text-base md:text-lg leading-relaxed text-gray-100 max-w-md mx-auto">
            仙台メンズエステの「頂点」を本気で狙う<br />ハイレベルサロン。
          </p>
          <div className="mt-10 inline-flex flex-col items-center gap-1 animate-bounce text-rose-200">
            <span className="text-xs">スクロールしてご説明します</span>
            <ChevronDown size={22} />
          </div>
        </div>
      </section>

      {/* コンセプト */}
      <Section icon={Sparkles} title="店舗コンセプト" tone="rose">
        <Card className="py-5">
          <p className="text-sm leading-relaxed text-gray-700">
            愛嬌があり、素直さや頑張る姿勢。<br />
            選び抜かれたビジュアル、洗練された施術、妥協のない接客。<br /><br />
            “艶華”は、和を基調とした上品さとおもてなしを大切にするハイレベルサロンです。<br />
            施術だけでなく、また会いたいと思っていただける<span className="font-bold text-rose-600">「特別なひととき」</span>をお届けします。
          </p>
        </Card>
      </Section>

      {/* 店舗概要 */}
      <Section icon={MapPin} title="店舗概要" tone="gray">
        <Card>
          <KV k="店舗名" v="艶華" />
          <KV k="業種" v="メンズエステ" />
          <KV k="営業時間" v="12:00〜26:00（25:00最終受付）" />
          <KV k="所在地" v="宮城県仙台市" />
          <KV k="HP" v={<a href="https://enka-salon.jp/" target="_blank" rel="noreferrer" className="text-rose-500 underline">enka-salon.jp</a>} />
        </Card>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <Card className="py-4 text-center px-2">
            <Train size={18} className="text-rose-500 mx-auto mb-1" />
            <p className="text-xs text-gray-400">サンルーム</p>
            <p className="text-sm font-bold mt-0.5">勾当台公園駅<br /><span className="text-xs font-medium text-gray-500">徒歩3分</span></p>
          </Card>
          <Card className="py-4 text-center px-2">
            <Train size={18} className="text-rose-500 mx-auto mb-1" />
            <p className="text-xs text-gray-400">ラズルーム</p>
            <p className="text-sm font-bold mt-0.5">北四番丁駅<br /><span className="text-xs font-medium text-gray-500">徒歩8分</span></p>
          </Card>
          <Card className="py-4 text-center px-2">
            <Train size={18} className="text-rose-500 mx-auto mb-1" />
            <p className="text-xs text-gray-400">インルーム</p>
            <p className="text-sm font-bold mt-0.5">北四番丁駅<br /><span className="text-xs font-medium text-gray-500">徒歩3分</span></p>
          </Card>
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">
          詳しい住所・入室方法は勤務確定後に個別にご案内します。
        </p>
      </Section>

      {/* 勤務・待機 */}
      <Section icon={Clock} title="勤務・待機時間" tone="rose">
        <Card>
          <KV k="待機開始" v="12:00 または 13:00" />
          {!isResident && <KV k="勤務時間" v="12時間勤務" hl />}
          <KV k="相談" v="勤務時間の相談可" />
        </Card>
      </Section>

      {/* 料金・報酬システム（お客様の料金・バック・店落ち・控除と支給をまとめて） */}
      <Section icon={ShieldCheck} title="料金・報酬システム" sub="お客様の料金・セラピストのバック・店落ち" tone="rose">
        {system === null ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-rose-400" /></div>
        ) : system.courses.length + system.options.length + system.nominations.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">料金・報酬の詳細は、面談時に個別にご案内します。</p>
        ) : (
          <div className="space-y-5">
            {([
              ["コース", system.courses],
              ["オプション", system.options],
              ["指名", system.nominations],
            ] as const).filter(([, rows]) => rows.length > 0).map(([title, rows]) => (
              <div key={title}>
                <p className="mb-2 text-sm font-bold text-gray-700">{title}</p>
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <div className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-1 bg-gray-50 px-3 py-2 text-[11px] font-bold text-gray-500">
                    <span>内容</span><span className="text-right">料金</span><span className="text-right text-rose-600">バック</span><span className="text-right">店落ち</span>
                  </div>
                  {rows.map((row) => (
                    <div key={row.key} className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] items-center gap-1 border-t border-gray-100 px-3 py-2.5 text-sm">
                      <span className="min-w-0 text-gray-800">{row.label}</span>
                      <span className="text-right tabular-nums text-gray-600">{yen(row.price)}</span>
                      <span className="text-right font-bold tabular-nums text-rose-600">{row.back > 0 ? yen(row.back) : "なし"}</span>
                      <span className="text-right tabular-nums text-gray-500">{yen(row.shop)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-gray-500">
              料金＝お客様のお支払い（カード・PayPayの手数料はお客様のご負担）／バック＝1本あたりのセラピストのお給料／店落ち＝お店の取り分。指名料・オプションは、コースのバックに上乗せされます。
            </p>
          </div>
        )}
      </Section>

      {/* 鉄板の組み合わせ・エスたま限定プラン */}
      {system && (signature || estamaPlans.length > 0) && (
        <Section icon={Crown} title="人気の組み合わせ・プラン" sub="よく入るコースと、エスたまからの限定プラン" tone="amber">
          <div className="space-y-3">
            {signature && (
              <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-rose-50 px-5 py-4 shadow-sm">
                <p className="text-xs font-bold text-amber-700">👑 鉄板の組み合わせ・いちばん人気</p>
                <p className="mt-1 text-base font-bold text-gray-800">{signature.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  艶華コース80分に、オプションパック -牡丹- を付ける組み合わせがいちばん多く入ります。
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/80 py-2"><p className="text-[11px] text-gray-500">料金</p><p className="text-sm font-bold tabular-nums">{yen(signature.price)}</p></div>
                  <div className="rounded-xl bg-white/80 py-2"><p className="text-[11px] text-rose-600">バック</p><p className="text-base font-bold tabular-nums text-rose-600">{yen(signature.back)}</p></div>
                  <div className="rounded-xl bg-white/80 py-2"><p className="text-[11px] text-gray-500">店落ち</p><p className="text-sm font-bold tabular-nums">{yen(signature.shop)}</p></div>
                </div>
              </div>
            )}
            {estamaPlans.map((plan) => (
              <Card key={plan.key} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800">{plan.label}{plan.label.includes("110") ? " リラックスプラン" : ""}</p>
                    {plan.note && <p className="mt-1 text-xs leading-relaxed text-gray-600">{plan.note}</p>}
                    <p className="mt-1 text-[11px] text-gray-400">エステ魂（エスたま）の会員限定のプランです</p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <p className="tabular-nums text-gray-500">料金 {yen(plan.price)}</p>
                    <p className="text-sm font-bold tabular-nums text-rose-600">バック {yen(plan.back)}</p>
                    <p className="tabular-nums text-gray-500">店落ち {yen(plan.shop)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* お給料から引くもの・支給されるもの */}
      <Section icon={Wallet} title="控除・支給（交通費・雑費・宿泊費）" sub="その日の退勤時に精算します" tone="gray">
        <Card>
          <KV k="雑費（控除）" v={<>1本 {yen(MISC_FEE_PER_SESSION)}<br /><span className="text-xs text-gray-400">1日 {yen(MISC_FEE_DAILY_CAP)} まで</span></>} />
          <KV
            k="宿泊費（控除）"
            v={isResident
              ? <>出稼ぎの方のみ<br /><span className="text-xs text-gray-400">1日 {yen(DEKASEGI_ACCOMMODATION_PER_DAY)}</span></>
              : <>1日 {yen(DEKASEGI_ACCOMMODATION_PER_DAY)}</>}
          />
          <KV k="交通費（支給）" v={<>マイページの「交通費申請」から申請<br /><span className="text-xs text-gray-400">お店が承認して精算でお渡し</span></>} />
          <KV k="お給料の受け取り" v={<>日払い（退勤時に精算）<br /><span className="text-xs text-gray-400">お預かりした現金から受け取り</span></>} hl />
        </Card>
        <div className="mt-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 text-sm shadow-sm">
          <p className="mb-2 text-xs font-bold text-gray-500">その日のお給料の計算</p>
          <p className="leading-relaxed text-gray-700">
            お給料 ＝ <span className="font-bold text-rose-600">バックの合計</span> − 雑費{isResident ? "" : " − 宿泊費"} ＋ 交通費{isResident ? "（出稼ぎの方は宿泊費も引きます）" : ""}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            カード・PayPayのお客様が多くて、お預かりした現金がお給料より少ない日は、足りない分をお店があとからお支払いします（振込か、次の出勤日の精算で相殺。マイページで選べます）。
          </p>
          {signature && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800">
              例：{signature.label}を2本 → バック {yen(signature.back * 2)} − 雑費 {yen(Math.min(MISC_FEE_PER_SESSION * 2, MISC_FEE_DAILY_CAP))}
              {!isResident && <> − 宿泊費 {yen(DEKASEGI_ACCOMMODATION_PER_DAY)}</>}
              {" "}＝ <span className="font-bold">{yen(signature.back * 2 - Math.min(MISC_FEE_PER_SESSION * 2, MISC_FEE_DAILY_CAP) - (isResident ? 0 : DEKASEGI_ACCOMMODATION_PER_DAY))}</span>（交通費は別に支給）
            </p>
          )}
        </div>
      </Section>

      {/* 集客・投稿サポート */}
      <Section icon={Share2} title="集客・投稿サポート" sub="投稿作業を、1回に" tone="rose" wide>
        <a
          href={simultaneousPostSystemImage}
          target="_blank"
          rel="noreferrer"
          aria-label="艶華の同時投稿システム画像を原寸で開く"
          className="block overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm transition hover:shadow-md"
        >
          <img
            src={simultaneousPostSystemImage}
            alt="写真1枚を600×600の正方形に整え、文章と一緒にホームページ・O2・魂セラピストへ同時投稿する艶華の集客支援システム"
            width={1080}
            height={1350}
            loading="lazy"
            decoding="async"
            className="h-auto w-full object-contain"
          />
        </a>
        <p className="mt-2 text-center text-xs leading-5 text-gray-500">
          画像をタップすると原寸で確認できます。テスト投稿ではホームページへ掲載されません。
        </p>
      </Section>

      {/* セラピストポータル（マイページ） */}
      <Section icon={Smartphone} title="セラピストポータル（マイページ）" sub="スマホ1つで、出勤・予約・精算まで" tone="rose">
        <p className="mb-4 text-sm leading-relaxed text-gray-600">
          セラピスト一人ひとりに専用のマイページがあります。シフト・予約・入室方法・精算・投稿まで、ここ1つで完結します。
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PORTAL_FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50">
                <Icon size={18} className="text-rose-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mb-2 mt-6 text-sm font-bold text-gray-800">使い方</p>
        <ol className="space-y-2">
          {PORTAL_STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">{i + 1}</span>
              <div>
                <p className="text-sm font-bold text-gray-800">{step.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ルーム環境 */}
      <Section icon={Home} title="ルーム環境・設備" sub="各ルーム共通" tone="gray">
        <div className="flex flex-wrap gap-2">
          {[
            "WiFi", "冷蔵庫", "電子レンジ", "布団セット", "ケトル", "電気毛布",
            "置型ヒーター", "ドラム洗濯機", "ドライヤー", "ヘアアイロン",
            "ホットアイマスク", "貸出MB", "iPad", "お出迎え着",
          ].map((x) => (
            <span key={x} className="text-sm bg-white border border-gray-200 rounded-full px-3 py-1.5 flex items-center gap-1">
              <Check size={13} className="text-rose-500" />{x}
            </span>
          ))}
        </div>

        {/* 備え付け設備の使い方（全力BOOKより） */}
        <div className="space-y-3 mt-5">
          <Card className="py-4">
            <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
              <Footprints size={16} className="text-rose-500" />サンダル（各ルーム合計3足）
            </p>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-white border border-gray-300 shrink-0" />セラピスト用（白）</li>
              <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-800 shrink-0" />お客様用❶（黒）</li>
              <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-white border border-gray-300 shrink-0" />お客様用❷（白）</li>
            </ul>
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
              ❷の白サンダルは、施術後などオイルがついている時専用で使います。
            </p>
          </Card>

          <Card className="py-4">
            <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
              <Tablet size={16} className="text-rose-500" />店舗備え付け iPad
            </p>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li className="flex items-center gap-2"><Check size={14} className="text-rose-500 shrink-0" />ボタンひとつで音楽再生</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-rose-500 shrink-0" />メニュー表の表示（お客様への提示用）</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-rose-500 shrink-0" />清掃チェックシートの送信</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-rose-500 shrink-0" />誓約書の記入（電子ペーパー）</li>
            </ul>
          </Card>
        </div>
      </Section>

      {/* 持ち物・準備 */}
      <Section icon={IdCard} title="持ち物・準備" tone="rose">
        <Card>
          <KV k="身分証" v="顔写真付き身分証" hl />
          <KV k="釣り銭" v={<>セラピストご準備<br /><span className="text-xs text-gray-400">千円札×10枚ほど</span></>} />
          <KV k="衣装" v="持ち込み可" />
        </Card>
      </Section>

      {/* 写真提出 */}
      <Section icon={Camera} title="ご提出いただく写真" tone="amber">
        <Card className="py-4">
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              "バストアップ",
              "くびれがわかる写真",
              "肩から足首までの全身写真",
              "鏡での自撮り写真",
              "自信のある部位",
            ].map((x, i) => (
              <li key={x} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                {x}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
            派遣確定から24時間以内に、HP・X作成用の使用可能な写真を必ずお送りください。
          </p>
        </Card>
      </Section>

      {/* 注意点 */}
      <Section icon={AlertTriangle} title="注意点（必ずご確認ください）" tone="gray">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-3">
          <div className="flex gap-2">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 font-medium leading-relaxed">
              裏引き行為が発覚した場合、<span className="font-bold">保証カット・交通費支給なし・即退店</span>となります。
            </p>
          </div>
          <div className="border-t border-red-200 pt-3 text-sm text-red-800">
            <p className="font-bold mb-1">保証カットの対象</p>
            <p>クレーム / 遅刻・早退 / 清掃不十分</p>
          </div>
        </div>
      </Section>

      {/* 今後の流れ（勤務が決まってから最初の出勤まで） */}
      <Section icon={ListChecks} title="今後の流れ" sub="勤務が決まってから、最初の出勤まで" tone="rose">
        <ol className="space-y-2">
          {NEXT_STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">{i + 1}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800"><Icon size={15} className="text-rose-500" />{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <footer className="py-10 text-center text-xs text-gray-400">
        艶華 ｜ 面談資料
      </footer>
    </div>
  );
}
