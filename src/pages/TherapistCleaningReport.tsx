import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { prepareCleaningReportImage } from "@/lib/cleaning-report-image";

type PreparedPhoto = {
  file: File;
  previewUrl: string;
};

type PhotoKind = "room" | "water";

interface PhotoUploadCardProps {
  id: string;
  label: string;
  description: string;
  photo: PreparedPhoto | null;
  preparing: boolean;
  disabled: boolean;
  onSelect: (file: File) => void;
  onClear: () => void;
}

function PhotoUploadCard({
  id,
  label,
  description,
  photo,
  preparing,
  disabled,
  onSelect,
  onClear,
}: PhotoUploadCardProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onSelect(file);
  };

  return (
    <Card className={photo ? "overflow-hidden border-primary/35" : "overflow-hidden border-dashed border-primary/40"}>
      <CardContent className="p-0">
        {photo ? (
          <div className="relative bg-muted">
            <img src={photo.previewUrl} alt={`${label}の確認画像`} className="h-52 w-full object-cover" />
            {!disabled && (
              <button
                type="button"
                onClick={onClear}
                className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white shadow"
                aria-label={`${label}の画像を削除`}
              >
                <X size={18} />
              </button>
            )}
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow">
              <CheckCircle2 size={14} />画像追加済み
            </span>
          </div>
        ) : (
          <label
            htmlFor={id}
            className={`flex min-h-44 flex-col items-center justify-center gap-2 px-5 py-7 text-center ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer active:bg-primary/5"}`}
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              {preparing ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
            </span>
            <span className="font-bold">{preparing ? "画像を準備中..." : label}</span>
            <span className="text-xs leading-5 text-muted-foreground">{description}</span>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background px-3 py-1.5 text-xs font-semibold text-primary">
              <ImagePlus size={14} />撮影・画像を選択
            </span>
          </label>
        )}

        {photo && !disabled && (
          <label htmlFor={id} className="flex cursor-pointer items-center justify-center gap-1.5 border-t bg-background px-4 py-3 text-sm font-semibold text-primary">
            {preparing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {preparing ? "画像を準備中..." : "撮り直す"}
          </label>
        )}
        <input
          id={id}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleChange}
          disabled={disabled || preparing}
        />
      </CardContent>
    </Card>
  );
}

async function readFunctionError(error: unknown): Promise<{ message: string; saved: boolean }> {
  const fallback = error instanceof Error ? error.message : "清掃完了報告を送信できませんでした";
  if (!error || typeof error !== "object" || !("context" in error)) {
    return { message: fallback, saved: false };
  }

  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return { message: fallback, saved: false };
  try {
    const payload = await context.clone().json() as { error?: string; saved?: boolean };
    return {
      message: payload.error || fallback,
      saved: payload.saved === true,
    };
  } catch {
    return { message: fallback, saved: false };
  }
}

export default function TherapistCleaningReport() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [castName, setCastName] = useState("");
  const [roomPhoto, setRoomPhoto] = useState<PreparedPhoto | null>(null);
  const [waterPhoto, setWaterPhoto] = useState<PreparedPhoto | null>(null);
  const [preparing, setPreparing] = useState<PhotoKind | null>(null);
  const [laundryStarted, setLaundryStarted] = useState(false);
  const [drainCleaned, setDrainCleaned] = useState(false);
  const [trashTakenOut, setTrashTakenOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const reportIdRef = useRef(crypto.randomUUID());
  const roomPhotoRef = useRef<PreparedPhoto | null>(null);
  const waterPhotoRef = useRef<PreparedPhoto | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    if (!token) {
      navigate("/", { replace: true });
      return;
    }

    let active = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase.rpc("get_cast_by_access_token", { p_token: token });
      if (!active) return;
      const row = (Array.isArray(data) ? data[0] : data) as { name?: string } | null;
      if (error || !row) {
        setLoadError("この清掃報告リンクを確認できませんでした");
      } else {
        setCastName(row.name || "セラピスト");
        const body = new FormData();
        body.append("token", token);
        body.append("action", "status");
        const result = await supabase.functions.invoke("submit-cleaning-report", { body });
        if (!active) return;
        if (result.error || !result.data?.success) {
          setLoadError("清掃報告の状態を確認できませんでした。ページを開き直してください");
        } else if (result.data.report) {
          reportIdRef.current = result.data.report.id;
          setReportSaved(true);
          setSubmitted(result.data.report.notification_status === "sent");
        }
      }
      setLoading(false);
    })();

    return () => { active = false; };
  }, [navigate, token]);

  useEffect(() => { roomPhotoRef.current = roomPhoto; }, [roomPhoto]);
  useEffect(() => { waterPhotoRef.current = waterPhoto; }, [waterPhoto]);
  useEffect(() => () => {
    if (roomPhotoRef.current) URL.revokeObjectURL(roomPhotoRef.current.previewUrl);
    if (waterPhotoRef.current) URL.revokeObjectURL(waterPhotoRef.current.previewUrl);
  }, []);

  const replacePhoto = async (kind: PhotoKind, sourceFile: File) => {
    if (reportSaved) return;
    setPreparing(kind);
    try {
      const file = await prepareCleaningReportImage(sourceFile);
      const next = { file, previewUrl: URL.createObjectURL(file) };
      if (kind === "room") {
        setRoomPhoto((current) => {
          if (current) URL.revokeObjectURL(current.previewUrl);
          return next;
        });
      } else {
        setWaterPhoto((current) => {
          if (current) URL.revokeObjectURL(current.previewUrl);
          return next;
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "画像を準備できませんでした");
    } finally {
      setPreparing(null);
    }
  };

  const clearPhoto = (kind: PhotoKind) => {
    if (reportSaved) return;
    if (kind === "room") {
      setRoomPhoto((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return null;
      });
    } else {
      setWaterPhoto((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return null;
      });
    }
  };

  const completedCount = Number(Boolean(roomPhoto))
    + Number(Boolean(waterPhoto))
    + Number(laundryStarted)
    + Number(trashTakenOut)
    + Number(drainCleaned);
  const ready = reportSaved || completedCount === 5;

  const submitReport = async () => {
    if (!token || !ready || submitting) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("report_id", reportIdRef.current);
      if (roomPhoto) formData.append("room_image", roomPhoto.file);
      if (waterPhoto) formData.append("water_image", waterPhoto.file);
      formData.append("drain_cleaned", String(drainCleaned));
      formData.append("laundry_started", String(laundryStarted));
      formData.append("trash_taken_out", String(trashTakenOut));

      const { data, error } = await supabase.functions.invoke("submit-cleaning-report", {
        body: formData,
      });
      if (error) {
        const detail = await readFunctionError(error);
        if (detail.saved) setReportSaved(true);
        throw new Error(detail.message);
      }
      if (!data?.success) throw new Error(data?.error || "清掃完了報告を送信できませんでした");

      setReportSaved(true);
      setSubmitted(true);
      toast.success("清掃完了報告を送信しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清掃完了報告を送信できませんでした");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-muted/25"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/25 p-5">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 py-8 text-center">
            <p className="font-semibold">{loadError}</p>
            <Button variant="outline" onClick={() => navigate(`/therapist/${token}`)}>ポータルへ戻る</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/25 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <Card className="w-full max-w-md border-emerald-200">
          <CardContent className="space-y-5 py-10 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={34} />
            </span>
            <div>
              <h1 className="text-xl font-bold">清掃完了報告を送信しました</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">予約通知グループへ、確認画像と完了内容を通知しました。</p>
            </div>
            <Button className="w-full" onClick={() => navigate(`/therapist/${token}`)}>セラピストポータルへ戻る</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/25 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
          <button type="button" onClick={() => navigate(`/therapist/${token}`)} className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted" aria-label="ポータルへ戻る">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">清掃完了報告</p>
            <p className="truncate text-[11px] text-muted-foreground">{castName} 様</p>
          </div>
          <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{reportSaved ? "保存済み" : `${completedCount}/5 完了`}</span>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 py-5">
        <section>
          <h1 className="text-xl font-bold leading-8">清掃が終わったら報告してください</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">画像2枚とチェック3項目がそろうと、清掃完了を報告できます。</p>
        </section>

        {!reportSaved && <>
        <PhotoUploadCard
          id="cleaning-room-photo"
          label="ルームの画像をアップロード"
          description="ベッド周りと床の片付けが確認できるように撮影"
          photo={roomPhoto}
          preparing={preparing === "room"}
          disabled={submitting || reportSaved}
          onSelect={(file) => void replacePhoto("room", file)}
          onClear={() => clearPhoto("room")}
        />

        <PhotoUploadCard
          id="cleaning-water-photo"
          label="水回りの画像をアップロード"
          description="浴室・洗面まわりの清掃状態が確認できるように撮影"
          photo={waterPhoto}
          preparing={preparing === "water"}
          disabled={submitting || reportSaved}
          onSelect={(file) => void replacePhoto("water", file)}
          onClear={() => clearPhoto("water")}
        />

        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-bold">洗面所の排水口の掃除</h2>
          <svg viewBox="0 0 320 110" role="img" aria-label="排水口の受け皿を外し、髪の毛を取り除き、ブラシで洗って戻す手順" className="my-3 w-full text-teal-700" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 60 Q50 115 90 60 Z M50 50 V15 M40 25 L50 15 60 25" />
            <ellipse cx="50" cy="45" rx="18" ry="7" fill="#ccfbf1" />
            <path d="M105 55 H120 M114 49 L120 55 114 61" />
            <ellipse cx="160" cy="70" rx="26" ry="12" fill="#ccfbf1" />
            <path d="M145 65 Q165 48 175 68 M145 72 Q160 55 177 73 M165 25 L155 49 M175 25 L165 49 M155 49 L165 49" />
            <path d="M200 55 H215 M209 49 L215 55 209 61 M250 20 L280 50 M270 45 L255 60 M275 50 L260 65 M280 55 L265 70" />
            <ellipse cx="270" cy="80" rx="30" ry="12" />
            <path d="M295 20 V35 M305 30 V45" stroke="#38bdf8" />
          </svg>
          <p className="text-sm leading-6">① 外せる受け皿・ヘアキャッチャーを外す → ② 髪の毛やゴミを取り、ゴミ箱へ → ③ ブラシで汚れを落とし、水で流して元に戻す</p>
          <p className="mt-2 text-xs text-muted-foreground">外れない部品は無理に外さず、見える範囲を掃除してください。</p>
        </section>
        <Card>
          <CardContent className="divide-y p-0">
            <label htmlFor="drain-cleaned" className="flex cursor-pointer items-center gap-3 px-4 py-4">
              <Checkbox id="drain-cleaned" checked={drainCleaned} onCheckedChange={(checked) => setDrainCleaned(checked === true)} disabled={submitting || reportSaved} />
              <span className="flex-1 font-semibold">洗面所の排水口を掃除した</span>
              {drainCleaned && <CheckCircle2 size={19} className="text-emerald-600" />}
            </label>
            <label htmlFor="laundry-started" className="flex cursor-pointer items-center gap-3 px-4 py-4">
              <Checkbox
                id="laundry-started"
                checked={laundryStarted}
                onCheckedChange={(checked) => setLaundryStarted(checked === true)}
                disabled={submitting || reportSaved}
              />
              <span className="flex-1 font-semibold">洗濯機を回した</span>
              {laundryStarted && <CheckCircle2 size={19} className="text-emerald-600" />}
            </label>
            <label htmlFor="trash-taken-out" className="flex cursor-pointer items-center gap-3 px-4 py-4">
              <Checkbox
                id="trash-taken-out"
                checked={trashTakenOut}
                onCheckedChange={(checked) => setTrashTakenOut(checked === true)}
                disabled={submitting || reportSaved}
              />
              <span className="flex-1 font-semibold">ゴミ捨て</span>
              {trashTakenOut && <CheckCircle2 size={19} className="text-emerald-600" />}
            </label>
          </CardContent>
        </Card>

        </>}

        {reportSaved && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <p>清掃報告は保存済みです。写真の再提出は不要です。下のボタンでLINE通知だけを再送できます。精算とは別に保存されています。</p>
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button className="h-12 w-full text-base font-bold" disabled={!ready || submitting || preparing !== null} onClick={() => void submitReport()}>
            {submitting && <Loader2 size={18} className="mr-2 animate-spin" />}
            {submitting ? "送信中..." : reportSaved ? "通知を再送" : "清掃完了報告"}
          </Button>
          {!ready && <p className="mt-1.5 text-center text-[11px] text-muted-foreground">未完了の項目があるため、まだ送信できません</p>}
        </div>
      </div>
    </div>
  );
}
