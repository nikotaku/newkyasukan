import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, RefreshCw, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStore } from "@/hooks/useAdminStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidEmail } from "@/lib/email";
import {
  CONTACT_FIELDS,
  CONTACT_TARGETS,
  normalizeContact,
  validateContact,
  type ContactValues,
} from "@/lib/storeContact";

// 設定ダッシュボードの「連絡先・SNS（正本）」。店舗情報（store_info）の 電話・公式LINE・メール・X・外部ブログ（O2の店舗ページ）を正本にする。
// 保存すると DBトリガー（private.on_store_contact_change）が HP のSNSリンクをそろえ、エステ魂・O2 の店舗ページへの反映を
// store_contact_sync に積む。HP・SMS・予約案内ページは店舗情報をそのまま読むので、保存した時点で切り替わる。

interface SyncRow {
  target: "estama" | "o2";
  status: "pending" | "running" | "done" | "failed" | "review_required";
  requested_at: string;
  finished_at: string | null;
  error: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = (table: string) => (supabase.from as any)(table);

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const EMPTY: ContactValues = { phone: "", line_url: "", email: "", x_url: "", blog_url: "" };

export default function StoreContactMaster() {
  const { storeId, loading: storeLoading } = useAdminStore();
  const [rowId, setRowId] = useState<string | null>(null);
  const [values, setValues] = useState<ContactValues>(EMPTY);
  const [saved, setSaved] = useState<ContactValues>(EMPTY);
  const [sync, setSync] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    const [infoRes, syncRes] = await Promise.all([
      untyped("store_info").select("id, phone, line_url, email, twitter_url, blog_url").eq("store_id", storeId).limit(1).maybeSingle(),
      untyped("store_contact_sync").select("target, status, requested_at, finished_at, error").eq("store_id", storeId),
    ]);
    const info = infoRes.data as Record<string, string | null> | null;
    const next: ContactValues = {
      phone: info?.phone ?? "",
      line_url: info?.line_url ?? "",
      email: info?.email ?? "",
      x_url: info?.twitter_url ?? "",
      blog_url: info?.blog_url ?? "",
    };
    setRowId((info?.id as string | undefined) ?? null);
    setValues(next);
    setSaved(next);
    setSync((syncRes.data ?? []) as SyncRow[]);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    if (!storeLoading) void load();
  }, [load, storeLoading]);

  // 反映待ちの間は少しずつ読み直す
  useEffect(() => {
    if (!sync.some((row) => row.status === "pending" || row.status === "running")) return;
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [sync, load]);

  const changed = CONTACT_FIELDS.some((field) => values[field.key] !== saved[field.key]);

  const save = async () => {
    if (!storeId || saving) return;
    const normalized = normalizeContact(values);
    const problem = validateContact(normalized, isValidEmail);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    const payload = {
      phone: normalized.phone,
      line_url: normalized.line_url || null,
      email: normalized.email || null,
      twitter_url: normalized.x_url || null,
      blog_url: normalized.blog_url || null,
    };
    const result = rowId
      ? await untyped("store_info").update(payload).eq("id", rowId).eq("store_id", storeId)
      : await untyped("store_info").insert({ ...payload, store_id: storeId, name: "" });
    setSaving(false);
    if (result.error) {
      toast.error(`保存できませんでした：${result.error.message}`);
      return;
    }
    toast.success("保存しました。HP・SMS・案内ページはすぐ切り替わり、エステ魂・O2は自動で書き換えます");
    void load();
  };

  if (loading) return <div className="py-12 text-center"><Loader2 className="inline-block animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div>
          <h3 className="font-bold">連絡先・SNS（正本）</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            ここを直すと、公式HP・お客様へのSMS・予約案内ページ・エステ魂の店舗ページ・O2の店舗アカウントに自動で反映します。ほかの画面では直さないでください。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {CONTACT_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`contact-${field.key}`}>{field.label}</Label>
              <Input
                id={`contact-${field.key}`}
                inputMode={field.key === "phone" ? "tel" : field.key === "email" ? "email" : "url"}
                placeholder={field.placeholder}
                value={values[field.key]}
                onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">{field.hint}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={!changed || saving}>
            {saving ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Save size={15} className="mr-1" />}
            保存して各媒体に反映
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">各媒体への反映</h3>
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw size={14} className="mr-1" />更新</Button>
        </div>
        <ul className="divide-y text-sm">
          {CONTACT_TARGETS.map((target) => {
            const row = target.syncKey ? sync.find((item) => item.target === target.syncKey) : null;
            const status = target.syncKey ? row?.status ?? "done" : "live";
            return (
              <li key={target.label} className="flex flex-wrap items-start gap-2 py-2.5">
                <span className="mt-0.5">
                  {status === "live" || status === "done" ? <CheckCircle2 size={16} className="text-emerald-600" />
                    : status === "failed" || status === "review_required" ? <XCircle size={16} className="text-rose-600" />
                      : <Clock size={16} className="text-amber-600" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{target.label}</p>
                  <p className="text-xs text-muted-foreground">{target.note}</p>
                  {row?.error && <p className="mt-1 text-xs text-rose-600">{row.error}</p>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {status === "live" ? "保存するとすぐ反映"
                    : status === "done" ? `反映済み ${time(row?.finished_at ?? null)}`
                      : status === "running" ? "書き換え中…"
                        : status === "pending" ? `反映待ち（${time(row?.requested_at ?? null)} に保存）`
                          : status === "review_required" ? "要確認"
                            : "失敗（自動でやり直します）"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
