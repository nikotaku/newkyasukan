import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Link2, Mail, Send, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStore } from "@/hooks/useAdminStore";
import { isValidEmail } from "@/lib/email";
import {
  EMPTY_NEWSLETTER_LINK_SETTINGS,
  getMissingNewsletterLinkWarnings,
  getUnresolvedNewsletterLinkWarnings,
  NEWSLETTER_TEMPLATES,
  SOCIAL_NETWORKS,
  type NewsletterLinkSettings,
  type SocialNetworkKey,
} from "@/lib/newsletterTemplates";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type CampaignStatus = "draft" | "sending" | "sent" | "partial" | "failed";

interface Campaign {
  id: string;
  title: string;
  subject: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: CampaignStatus;
  created_at: string;
  sent_at: string | null;
}

interface NewsletterMember {
  id: string;
  name: string;
  email: string;
  created_at: string;
  newsletter_opt_in: boolean;
}

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "下書き",
  sending: "送信中",
  sent: "送信完了",
  partial: "一部失敗",
  failed: "送信失敗",
};

const STATUS_CLASS_NAMES: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sending: "bg-blue-100 text-blue-700",
  sent: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-700",
};

const SITE_CONTENT_LINK_KEYS = [
  "store_sns_x",
  "store_sns_line",
  "store_sns_o2",
  "store_sns_instagram",
  "store_sns_bluesky",
] as const;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function makeHomepageUrl(customDomain?: string | null, slug?: string) {
  if (customDomain) return `https://${customDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  if (typeof window === "undefined") return "";
  const origin = window.location.origin.replace(/\/$/, "");
  return slug ? `${origin}/?store=${encodeURIComponent(slug)}` : `${origin}/`;
}

export function NewsletterCampaignsTab() {
  const { store, storeId, loading: storeLoading } = useAdminStore();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [members, setMembers] = useState<NewsletterMember[]>([]);
  const [eligibleRecipients, setEligibleRecipients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [pendingSend, setPendingSend] = useState<Campaign | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [linkSettings, setLinkSettings] = useState<NewsletterLinkSettings>(EMPTY_NEWSLETTER_LINK_SETTINGS);
  const [form, setForm] = useState({ title: "", subject: "", bodyText: "" });

  const fetchData = useCallback(async () => {
    if (storeLoading || !storeId) return;
    setLoading(true);
    try {
      const [campaignResult, memberResult] = await Promise.all([
        supabase
          .from("newsletter_campaigns")
          .select("id, title, subject, recipient_count, sent_count, failed_count, status, created_at, sent_at")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("customers")
          .select("id, name, email, created_at, newsletter_opt_in")
          .eq("store_id", storeId)
          .eq("newsletter_opt_in", true)
          .or("is_banned.is.null,is_banned.eq.false")
          .not("email", "is", null)
          .order("created_at", { ascending: false })
          .limit(2_000),
      ]);
      if (campaignResult.error) throw campaignResult.error;
      if (memberResult.error) throw memberResult.error;

      setCampaigns((campaignResult.data || []) as Campaign[]);
      const memberList = (memberResult.data || []) as NewsletterMember[];
      setMembers(memberList);
      const uniqueEmails = new Set(
        memberList
          .map((member) => String(member.email || "").trim().toLowerCase())
          .filter(isValidEmail),
      );
      setEligibleRecipients(uniqueEmails.size);
    } catch (error) {
      console.error("Failed to load newsletter data", error);
      toast.error("メルマガ情報の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [storeId, storeLoading]);

  const fetchLinkSettings = useCallback(async () => {
    if (storeLoading || !storeId) return;
    const homepageUrl = makeHomepageUrl(store?.custom_domain, store?.slug);
    try {
      const [siteContentResult, storeInfoResult] = await Promise.all([
        supabase
          .from("site_content")
          .select("key, value")
          .eq("store_id", storeId)
          .in("key", [...SITE_CONTENT_LINK_KEYS]),
        supabase
          .from("store_info")
          .select("line_url, twitter_url")
          .eq("store_id", storeId)
          .limit(1)
          .maybeSingle(),
      ]);
      if (siteContentResult.error) throw siteContentResult.error;
      if (storeInfoResult.error) throw storeInfoResult.error;

      const content = new Map((siteContentResult.data || []).map((row) => [row.key, row.value]));
      const storeInfo = storeInfoResult.data;
      setLinkSettings({
        homepageUrl,
        couponUrl: storeInfo?.line_url || content.get("store_sns_line") || "",
        socialUrls: {
          x: content.get("store_sns_x") || storeInfo?.twitter_url || "",
          line: content.get("store_sns_line") || storeInfo?.line_url || "",
          o2: content.get("store_sns_o2") || "",
          instagram: content.get("store_sns_instagram") || "",
          bluesky: content.get("store_sns_bluesky") || "",
        },
      });
    } catch (error) {
      console.error("Failed to load newsletter links", error);
      setLinkSettings({ ...EMPTY_NEWSLETTER_LINK_SETTINGS, homepageUrl });
    }
  }, [store?.custom_domain, store?.slug, storeId, storeLoading]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetchLinkSettings();
  }, [fetchLinkSettings]);

  const canSave = useMemo(() => (
    form.title.trim().length > 0
    && form.subject.trim().length > 0
    && form.bodyText.trim().length > 0
  ), [form]);

  const currentTemplate = useMemo(
    () => NEWSLETTER_TEMPLATES.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId],
  );
  const missingLinkWarnings = useMemo(
    () => getMissingNewsletterLinkWarnings(linkSettings),
    [linkSettings],
  );
  const unresolvedLinkWarnings = useMemo(
    () => getUnresolvedNewsletterLinkWarnings(form.bodyText),
    [form.bodyText],
  );

  const updateSocialUrl = (key: SocialNetworkKey, value: string) => {
    setLinkSettings((current) => ({
      ...current,
      socialUrls: { ...current.socialUrls, [key]: value },
    }));
  };

  const applyTemplate = (templateId: string) => {
    const template = NEWSLETTER_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const hasDraft = form.title.trim() || form.subject.trim() || form.bodyText.trim();
    if (hasDraft && !window.confirm("現在編集中の内容をテンプレートで置き換えます。よろしいですか？")) return;

    setForm(template.buildDraft(linkSettings, store?.name));
    setSelectedTemplateId(templateId);
    toast.success(`「${template.name}」を本文へ反映しました`);
  };

  const saveDraft = async () => {
    if (!canSave || saving) return;
    if (unresolvedLinkWarnings.length > 0) {
      toast.error(`下書き前に ${unresolvedLinkWarnings.join("・")} を設定してください`);
      return;
    }
    if (form.title.trim().length > 100 || form.subject.trim().length > 200 || form.bodyText.trim().length > 20_000) {
      toast.error("タイトル・件名・本文の文字数上限を確認してください");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("newsletter_campaigns").insert({
        store_id: storeId,
        title: form.title.trim(),
        subject: form.subject.trim(),
        body_text: form.bodyText.trim(),
      });
      if (error) throw error;
      setForm({ title: "", subject: "", bodyText: "" });
      setSelectedTemplateId(null);
      toast.success("メルマガを下書きとして保存しました");
      await fetchData();
    } catch (error) {
      console.error("Failed to save newsletter draft", error);
      toast.error("下書きの保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const sendCampaign = async () => {
    if (!pendingSend || sendingId) return;
    const campaign = pendingSend;
    setPendingSend(null);
    setSendingId(campaign.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-newsletter", {
        body: { campaignId: campaign.id },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.message || "メール送信サービスが送信を完了できませんでした。");
      }
      toast.success(`${data.sentCount.toLocaleString()}件へメルマガを送信しました`);
      await fetchData();
    } catch (error) {
      console.error("Failed to send newsletter", error);
      toast.error(error instanceof Error ? error.message : "メルマガの送信に失敗しました");
      await fetchData();
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5"><Users className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">配信対象</p><p className="text-xl font-bold tabular-nums">{loading ? "—" : `${eligibleRecipients.toLocaleString()}件`}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2.5"><CheckCircle2 className="h-5 w-5 text-emerald-700" /></div>
            <div><p className="text-xs text-muted-foreground">送信済み配信</p><p className="text-xl font-bold tabular-nums">{loading ? "—" : `${campaigns.filter((campaign) => campaign.status === "sent").length}件`}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2.5"><Clock3 className="h-5 w-5 text-amber-700" /></div>
            <div><p className="text-xs text-muted-foreground">送信待ち下書き</p><p className="text-xl font-bold tabular-nums">{loading ? "—" : `${campaigns.filter((campaign) => campaign.status === "draft").length}件`}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/25 bg-gradient-to-br from-primary/[0.04] to-background">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />反応を設計した配信テンプレート</CardTitle>
          <CardDescription>目的ごとに主CTAを1つに絞り、HP・公式SNS・クーポン受取をすべて備えた5種類の下書きを作成できます。実施日・特典・条件は必ず実際の内容に書き換えてください。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {NEWSLETTER_TEMPLATES.map((template) => (
              <div key={template.id} className={`rounded-xl border bg-background p-4 transition-shadow ${currentTemplate?.id === template.id ? "border-primary ring-2 ring-primary/20" : "border-border"}`}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-medium text-primary">{template.category}</p>
                    <h3 className="font-semibold leading-snug">{template.name}</h3>
                  </div>
                  {currentTemplate?.id === template.id && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">選択中</span>}
                </div>
                <p className="text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">設計：</span>{template.designNote}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">主CTA：</span>{template.primaryCta}</p>
                <Button className="mt-4 w-full" size="sm" variant={currentTemplate?.id === template.id ? "secondary" : "outline"} onClick={() => applyTemplate(template.id)}>
                  {currentTemplate?.id === template.id ? "本文へ再反映" : "このテンプレートを使う"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" />配信リンクを確認・編集</CardTitle>
          <CardDescription>初期値は現在の店舗ドメイン、店舗情報、HPのSNS設定から読み込みます。ここで編集した内容は、テンプレートを本文へ反映する際に使用されます。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {missingLinkWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {missingLinkWarnings.join("・")} が未設定です。テンプレート利用後、本文に表示される案内を残したままでは下書き保存できません。
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="newsletter-homepage-url">HPリンク</Label><Input id="newsletter-homepage-url" type="url" placeholder="https://..." value={linkSettings.homepageUrl} onChange={(event) => setLinkSettings((current) => ({ ...current, homepageUrl: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="newsletter-coupon-url">クーポン受取リンク</Label><Input id="newsletter-coupon-url" type="url" placeholder="https://..." value={linkSettings.couponUrl} onChange={(event) => setLinkSettings((current) => ({ ...current, couponUrl: event.target.value }))} /></div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">公式SNSアカウント</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SOCIAL_NETWORKS.map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`newsletter-social-${key}`} className="text-xs text-muted-foreground">{label}</Label>
                  <Input id={`newsletter-social-${key}`} type="url" placeholder="https://..." value={linkSettings.socialUrls[key]} onChange={(event) => updateSocialUrl(key, event.target.value)} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />登録メンバー一覧</CardTitle>
          <CardDescription>メルマガに登録しているメンバーの一覧です。配信停止したメンバーは自動で除外されます。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p className="py-6 text-center text-sm text-muted-foreground">読み込み中...</p> : members.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">まだメルマガ登録者はいません。</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="px-2 py-3 font-medium">名前</th><th className="px-2 py-3 font-medium">メールアドレス</th><th className="px-2 py-3 font-medium">登録日時</th></tr></thead>
                <tbody>{members.map((member) => <tr key={member.id} className="border-b last:border-0"><td className="px-2 py-3 font-medium">{member.name}</td><td className="px-2 py-3">{member.email}</td><td className="px-2 py-3 text-xs text-muted-foreground">{formatDateTime(member.created_at)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />メルマガを作成</CardTitle>
          <CardDescription>配信同意済みで、連絡停止・利用禁止ではない有効メールアドレスだけを対象にします。テンプレートの［ ］部分、リンク、対象・期限・条件を確認してから下書きに保存してください。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="newsletter-title">管理用タイトル</Label><Input id="newsletter-title" value={form.title} maxLength={100} placeholder="例：9月限定キャンペーン" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="newsletter-subject">メール件名</Label><Input id="newsletter-subject" value={form.subject} maxLength={200} placeholder="例：【期間限定】お得なお知らせ" onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="newsletter-body">本文</Label><Textarea id="newsletter-body" value={form.bodyText} maxLength={20_000} rows={16} placeholder="お客様へお届けする本文を入力してください。改行とURLはそのままメールに反映されます。" onChange={(event) => setForm((current) => ({ ...current, bodyText: event.target.value }))} /><p className="text-right text-xs text-muted-foreground">{form.bodyText.length.toLocaleString()} / 20,000</p></div>
          {unresolvedLinkWarnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>本文に未設定の {unresolvedLinkWarnings.join("・")} があります。上の「配信リンク」を入力してからテンプレートを再反映してください。</span></div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />送信前に必ず対象件数、リンク先、特典の期限・条件を確認してください。下書き状態ではメールは送られません。</span><Button onClick={saveDraft} disabled={!canSave || saving || !storeId}>{saving ? "保存中…" : "下書きに保存"}</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">配信履歴</CardTitle><CardDescription>配信の送信結果はここに記録されます。</CardDescription></CardHeader>
        <CardContent>
          {loading ? <p className="py-6 text-center text-sm text-muted-foreground">読み込み中...</p> : campaigns.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">まだメルマガは作成されていません。</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="px-2 py-3 font-medium">タイトル</th><th className="px-2 py-3 font-medium">状態</th><th className="px-2 py-3 font-medium text-right">対象</th><th className="px-2 py-3 font-medium text-right">送信 / 失敗</th><th className="px-2 py-3 font-medium">作成 / 送信日時</th><th className="px-2 py-3 font-medium text-right">操作</th></tr></thead>
                <tbody>{campaigns.map((campaign) => <tr key={campaign.id} className="border-b last:border-0"><td className="max-w-[220px] px-2 py-3"><p className="truncate font-medium">{campaign.title}</p><p className="truncate text-xs text-muted-foreground">{campaign.subject}</p></td><td className="px-2 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS_NAMES[campaign.status]}`}>{STATUS_LABELS[campaign.status]}</span></td><td className="px-2 py-3 text-right tabular-nums">{campaign.status === "draft" ? `${eligibleRecipients.toLocaleString()}件（予定）` : `${campaign.recipient_count.toLocaleString()}件`}</td><td className="px-2 py-3 text-right tabular-nums">{campaign.status === "draft" ? "—" : `${campaign.sent_count.toLocaleString()} / ${campaign.failed_count.toLocaleString()}`}</td><td className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(campaign.created_at)}<br />{campaign.sent_at ? `送信：${formatDateTime(campaign.sent_at)}` : "未送信"}</td><td className="px-2 py-3 text-right">{campaign.status === "draft" && <Button size="sm" onClick={() => setPendingSend(campaign)} disabled={sendingId === campaign.id || eligibleRecipients === 0}><Send className="mr-1 h-3.5 w-3.5" />送信</Button>}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(pendingSend)} onOpenChange={(open) => { if (!open && !sendingId) setPendingSend(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>このメルマガを送信しますか？</AlertDialogTitle>
            <AlertDialogDescription>「{pendingSend?.subject}」を、現在の配信対象 {eligibleRecipients.toLocaleString()} 件へ送信します。送信後は同じ下書きを再送できません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>キャンセル</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void sendCampaign(); }}>送信を確定する</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
