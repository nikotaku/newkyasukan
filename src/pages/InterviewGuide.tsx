import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft, MapPin, Clock, Train, ShieldCheck, Banknote, Wallet, Car,
  Home, IdCard, Camera, AlertTriangle, Sparkles, Twitter, Check, ChevronDown,
} from "lucide-react";

/**
 * 面談用（画面共有）ページ。ビデオ通話で候補者に画面共有しながら、
 * 店舗詳細・条件（保証/女子給/交通費/ルーム環境/注意点）を説明する資料。
 * 「全力BOOK」マニュアルと店舗詳細をもとに構成。縦スクロール・大きめ文字で見やすく。
 */

export default function InterviewGuide() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  useEffect(() => { document.title = "全力エステ 仙台｜面談資料"; }, []);

  const Section = ({ id, icon: Icon, title, sub, children, tone = "rose" }: {
    id?: string; icon: any; title: string; sub?: string; children: React.ReactNode; tone?: "rose" | "amber" | "gray";
  }) => {
    const toneMap: Record<string, string> = {
      rose: "from-rose-500 to-pink-500",
      amber: "from-amber-500 to-orange-500",
      gray: "from-gray-600 to-gray-700",
    };
    return (
      <section id={id} className="px-5 py-10 border-b border-gray-100">
        <div className="max-w-xl mx-auto">
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
        onClick={() => navigate("/staff")}
        className="fixed top-3 left-3 z-50 flex items-center gap-1 text-xs bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow text-gray-500 hover:text-gray-800 print:hidden"
      >
        <ArrowLeft size={13} /> 管理画面へ
      </button>

      {/* HERO */}
      <section className="relative min-h-[70vh] flex flex-col items-center justify-center text-center px-6 bg-gradient-to-br from-gray-900 via-rose-900 to-gray-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <Sparkles className="absolute top-16 left-10" size={40} />
          <Sparkles className="absolute bottom-24 right-12" size={32} />
        </div>
        <div className="relative">
          <p className="text-xs tracking-[0.4em] text-rose-300 mb-4">ZENRYOKU ESTHE SENDAI</p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">全力エステ 仙台</h1>
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
            “全力エステ”は、仙台のメンズエステ界における<span className="font-bold text-rose-600">「頂点」</span>を本気で狙うハイレベルサロンです。<br />
            ただ癒すだけじゃない。あなたの五感すべてを圧倒する<span className="font-bold text-rose-600">「全力の一撃」</span>をご堪能ください。
          </p>
        </Card>
      </Section>

      {/* 店舗概要 */}
      <Section icon={MapPin} title="店舗概要" tone="gray">
        <Card>
          <KV k="店舗名" v="全力エステ 仙台" />
          <KV k="業種" v="メンズエステ" />
          <KV k="営業時間" v="12:00〜26:00（25:00最終受付）" />
          <KV k="所在地" v="宮城県仙台市" />
          <KV k="HP" v={<a href="https://zenryoku-esthe.com/" target="_blank" rel="noreferrer" className="text-rose-500 underline">zenryoku-esthe.com</a>} />
        </Card>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Card className="py-4 text-center">
            <Train size={18} className="text-rose-500 mx-auto mb-1" />
            <p className="text-xs text-gray-400">インルーム 最寄り</p>
            <p className="text-sm font-bold mt-0.5">地下鉄 北四番丁駅</p>
          </Card>
          <Card className="py-4 text-center">
            <Train size={18} className="text-rose-500 mx-auto mb-1" />
            <p className="text-xs text-gray-400">ラズルーム 最寄り</p>
            <p className="text-sm font-bold mt-0.5">地下鉄 勾当台公園駅</p>
          </Card>
        </div>
      </Section>

      {/* 勤務・待機 */}
      <Section icon={Clock} title="勤務・待機時間" tone="rose">
        <Card>
          <KV k="待機開始" v="12:00 または 13:00" />
          <KV k="勤務時間" v="12時間勤務" hl />
          <KV k="相談" v="勤務時間の相談可" />
        </Card>
      </Section>

      {/* 保証 */}
      <Section icon={ShieldCheck} title="保証制度" tone="rose">
        <div className="bg-gradient-to-br from-rose-50 to-amber-50 rounded-2xl p-5 text-center mb-3 border border-rose-100">
          <p className="text-sm text-gray-500">保証</p>
          <p className="text-3xl font-bold text-rose-600 my-1">2〜4万円</p>
          <p className="text-xs text-gray-500">（上限 10万円）</p>
        </div>
        <Card>
          <KV k="リピート時の保証" v="可（査定あり）" />
          <div className="pt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
            ※ リピートの際は保証を確約できない旨をお伝えください。
          </div>
        </Card>

        <p className="text-sm font-bold text-gray-700 mt-6 mb-2 flex items-center gap-2">
          <Twitter size={15} className="text-sky-500" />保証支給条件
        </p>
        <Card>
          <KV k="X（Twitter）更新" v={<>写真付き 1日3件<br />ショート動画 1日1件</>} hl />
          <KV k="待機" v="12時間待機" />
        </Card>
      </Section>

      {/* 女子給 */}
      <Section icon={Banknote} title="女子給（バック）" tone="amber">
        <Card>
          <p className="text-xs text-gray-400 mb-1">アロマオイルコース（全身オイルマッサージ）</p>
          <KV k="本指名 / 姫予約" v="2,000円" hl />
          <div className="pt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mt-2">
            ※ ネット指名はバックが発生しません。
          </div>
        </Card>
        <div className="mt-3">
          <Card className="py-4">
            <p className="text-xs text-gray-400 mb-1">メニュー例</p>
            <p className="text-sm text-gray-700">全力コース80分 + MB・極液・DR で <span className="font-bold text-rose-600">29,000円</span>（ハンドあり）</p>
          </Card>
        </div>
      </Section>

      {/* 控除 */}
      <Section icon={Wallet} title="控除" tone="gray">
        <Card>
          <KV k="雑費" v={<>1日 上限2,000円<br /><span className="text-xs text-gray-400">（本あたり1,000円）</span></>} />
          <KV k="宿泊費" v="1日 2,000円" />
        </Card>
      </Section>

      {/* 交通費 */}
      <Section icon={Car} title="交通費支給" tone="rose">
        <Card>
          <KV k="3日間勤務" v="上限 5,000円" hl />
          <KV k="5日間勤務" v="上限 10,000円" hl />
        </Card>
        <ul className="mt-3 space-y-1.5 text-xs text-gray-500">
          <li>・精算は最終日の翌日</li>
          <li>・交通機関の領収書の提出が必須</li>
        </ul>
      </Section>

      {/* ルーム環境 */}
      <Section icon={Home} title="ルーム環境・設備" tone="gray">
        <div className="flex flex-wrap gap-2">
          {[
            "WiFi", "冷蔵庫", "電子レンジ", "布団セット", "ケトル", "電気毛布",
            "置型ヒーター", "ドラム洗濯機", "ドライヤー", "ヘアアイロン",
            "貸出MB", "iPad", "お出迎え着",
          ].map((x) => (
            <span key={x} className="text-sm bg-white border border-gray-200 rounded-full px-3 py-1.5 flex items-center gap-1">
              <Check size={13} className="text-rose-500" />{x}
            </span>
          ))}
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

      <footer className="py-10 text-center text-xs text-gray-400">
        全力エステ 仙台 ｜ 面談資料
      </footer>
    </div>
  );
}
