import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, Loader2, Send, Share, SquarePlus, Trash2 } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  ALL_PUSH_TOPICS,
  PUSH_TOPICS,
  currentPushSubscription,
  disablePush,
  enablePush,
  isIOS,
  isPushSupported,
  isStandalone,
  sendTestPush,
  updatePushTopics,
  type PushTopic,
} from "@/lib/adminPush";

interface DeviceRow {
  id: string;
  endpoint: string;
  device_label: string | null;
  topics: string[];
  created_at: string;
  last_success_at: string | null;
  last_error: string | null;
}

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function NotificationSettings() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { store: adminStore } = useAdminStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const supported = isPushSupported();
  const ios = isIOS();
  const standalone = isStandalone();
  const needsHomeScreen = ios && !standalone;

  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(supported ? Notification.permission : "unsupported");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | "topics" | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const refresh = useCallback(async () => {
    const subscription = await currentPushSubscription().catch(() => null);
    setEndpoint(subscription?.endpoint ?? null);
    if (supported) setPermission(Notification.permission);
    if (!user) return;
    const { data } = await supabase
      .from("push_subscriptions" as never)
      .select("id,endpoint,device_label,topics,created_at,last_success_at,last_error")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setDevices((data as DeviceRow[] | null) ?? []);
  }, [supported, user]);

  useEffect(() => {
    refresh();
  }, [refresh, adminStore?.id]);

  const thisDevice = devices.find((device) => device.endpoint === endpoint) ?? null;
  const subscribed = Boolean(endpoint && thisDevice);
  const topics = (thisDevice?.topics ?? ALL_PUSH_TOPICS) as PushTopic[];

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      toast({ title: "できませんでした", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const handleEnable = () => run("enable", async () => {
    if (!adminStore?.id) throw new Error("店舗の読み込み中です。少し待ってからもう一度押してください");
    await enablePush(adminStore.id, topics.length ? topics : ALL_PUSH_TOPICS);
    toast({ title: "この端末で通知を受け取ります", description: "「テスト通知を送る」で届くか確かめてください" });
  });

  const handleDisable = () => run("disable", async () => {
    await disablePush();
    toast({ title: "この端末の通知をやめました" });
  });

  const handleTest = () => run("test", async () => {
    const result = await sendTestPush();
    toast({ title: result.sent ? `テスト通知を送りました（${result.sent}台）` : "送れた端末がありませんでした", description: result.sent ? "数秒で届きます。届かないときは端末の通知設定を確認してください" : undefined });
  });

  const toggleTopic = (topic: PushTopic, on: boolean) => run("topics", async () => {
    if (!adminStore?.id) return;
    const next = on ? Array.from(new Set([...topics, topic])) : topics.filter((key) => key !== topic);
    await updatePushTopics(adminStore.id, ALL_PUSH_TOPICS.filter((key) => next.includes(key)));
  });

  const removeDevice = (device: DeviceRow) => run("disable", async () => {
    if (device.endpoint === endpoint) {
      await disablePush();
      return;
    }
    const { error } = await supabase.from("push_subscriptions" as never).delete().eq("id", device.id);
    if (error) throw new Error(error.message);
  });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-4 mt-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Bell size={20} />スマホ通知</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理画面をスマホのホーム画面に追加すると、WEB予約・SMSの返信などをアプリのように通知で受け取れます。
              LINEへの通知は今まで通り届きます（お試し中なので両方届きます）。
            </p>
          </div>

          {needsHomeScreen && (
            <Card className="border-primary/40">
              <CardHeader className="pb-2"><CardTitle className="text-base">iPhoneはホーム画面に追加してから設定します</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>このページを <b>Safari</b> で開く</li>
                  <li>画面下の <Share size={14} className="inline -mt-0.5" />（共有ボタン）をタップ</li>
                  <li><SquarePlus size={14} className="inline -mt-0.5" />「ホーム画面に追加」→ 名前は「艶華 管理」のまま「追加」</li>
                  <li>ホーム画面にできた <b>艶華 管理</b> のアイコンから開く</li>
                  <li>右上の人のアイコン →「スマホ通知の設定」→「この端末で通知を受け取る」</li>
                </ol>
                <p className="text-xs text-muted-foreground">iOS 16.4 以降が必要です。Safariのままでは通知を受け取れません。</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                この端末
                {subscribed ? <Badge>通知を受け取る</Badge> : <Badge variant="secondary">未設定</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!supported ? (
                <p className="text-sm text-muted-foreground">
                  {needsHomeScreen ? "ホーム画面に追加したアイコンから開くと設定できます。" : "このブラウザは通知に対応していません。スマホならSafari（iPhone）かChrome（Android）で開いてください。"}
                </p>
              ) : permission === "denied" ? (
                <p className="text-sm text-destructive">
                  通知がブロックされています。{ios ? "iPhoneの「設定」→「通知」→「艶華 管理」" : "ブラウザのサイト設定"}で通知を許可してから、もう一度開いてください。
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {!subscribed ? (
                  <Button onClick={handleEnable} disabled={!supported || permission === "denied" || busy !== null}>
                    {busy === "enable" ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Bell size={16} className="mr-1.5" />}
                    この端末で通知を受け取る
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleTest} disabled={busy !== null}>
                      {busy === "test" ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Send size={16} className="mr-1.5" />}
                      テスト通知を送る
                    </Button>
                    <Button variant="outline" onClick={handleDisable} disabled={busy !== null}>
                      <BellOff size={16} className="mr-1.5" />この端末の通知をやめる
                    </Button>
                  </>
                )}
              </div>

              {subscribed && (
                <div className="border-t pt-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">この端末で受け取る通知</p>
                  {PUSH_TOPICS.map((topic) => (
                    <label key={topic.key} className="flex items-start justify-between gap-3">
                      <span>
                        <span className="text-sm font-medium block">{topic.label}</span>
                        <span className="text-xs text-muted-foreground">{topic.hint}</span>
                      </span>
                      <Switch
                        checked={topics.includes(topic.key)}
                        disabled={busy !== null}
                        onCheckedChange={(on) => toggleTopic(topic.key, on)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {devices.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">通知を受け取る端末（{devices.length}台）</CardTitle></CardHeader>
              <CardContent className="divide-y">
                {devices.map((device) => (
                  <div key={device.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {device.device_label || "端末"}
                        {device.endpoint === endpoint && <Badge variant="outline" className="text-[10px]">この端末</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        登録 {formatDateTime(device.created_at)} ・ 最後に届いた通知 {formatDateTime(device.last_success_at)}
                      </div>
                      {device.last_error && <div className="text-xs text-destructive truncate">送信エラー: {device.last_error}</div>}
                    </div>
                    <Button variant="ghost" size="icon" aria-label="この端末を外す" disabled={busy !== null} onClick={() => removeDevice(device)}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
