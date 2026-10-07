// 設定 → 電話（SUBLINE）。アクセストークンの登録（Vaultに保存・画面には「登録済み」だけ）、
// 接続の確認（メンバーと050番号）、パソコンから発信するときの通知先、HPの電話番号の切り替え。
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, KeyRound, Loader2, Phone, PlugZap, Smartphone, Trash2 } from "lucide-react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/hooks/useAdminStore";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone } from "@/hooks/useStoreContact";
import {
  invokeSubline,
  loadSublineSettings,
  type SublineMemberView,
  type SublineSettings,
} from "@/hooks/useSublinePhone";
import { dialDigits } from "@/lib/sublinePhone";

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const rpc = (name: string, args: Record<string, unknown>) => supabase.rpc(name as never, args as never);

export default function PhoneSettings() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { store } = useAdminStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const storeId = store?.id ?? null;

  const [settings, setSettings] = useState<SublineSettings | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | "check" | "member" | "hp" | null>(null);
  const [members, setMembers] = useState<SublineMemberView[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [hpPhone, setHpPhone] = useState<{ id: string | null; phone: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);

  const reload = useCallback(async () => {
    if (!storeId) return;
    setSettings(await loadSublineSettings(storeId, true));
    const { data } = await supabase.from("store_info" as never).select("id, phone").eq("store_id", storeId).limit(1).maybeSingle();
    const row = data as { id: string; phone: string | null } | null;
    setHpPhone({ id: row?.id ?? null, phone: row?.phone ?? "" });
  }, [storeId]);

  useEffect(() => { void reload(); }, [reload]);

  const canManage = Boolean(settings?.can_manage);

  const saveToken = async () => {
    if (!storeId || !token.trim()) return;
    setBusy("save");
    const { error } = await rpc("save_subline_token", { p_store_id: storeId, p_token: token.trim() });
    setBusy(null);
    if (error) {
      toast({ title: "登録できませんでした", description: error.message, variant: "destructive" });
      return;
    }
    setToken("");
    setMembers(null);
    toast({ title: "アクセストークンを登録しました", description: "「接続を確認」でSUBLINEにつながるか確かめてください" });
    await reload();
  };

  const deleteToken = async () => {
    if (!storeId || !window.confirm("SUBLINEとの連携をやめますか？（管理画面の電話番号は普通の電話リンクに戻ります）")) return;
    setBusy("delete");
    const { error } = await rpc("clear_subline_token", { p_store_id: storeId });
    setBusy(null);
    if (error) {
      toast({ title: "削除できませんでした", description: error.message, variant: "destructive" });
      return;
    }
    setMembers(null);
    await reload();
  };

  const check = async () => {
    if (!storeId) return;
    setBusy("check");
    setCheckError(null);
    try {
      const result = await invokeSubline<{ members: SublineMemberView[] }>({ action: "members", storeId });
      setMembers(result.members);
    } catch (error) {
      setMembers(null);
      setCheckError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
      await reload();
    }
  };

  const chooseMember = async (member: SublineMemberView) => {
    if (!storeId) return;
    setBusy("member");
    const { error } = await rpc("set_subline_member", {
      p_store_id: storeId, p_account_code: member.account_code, p_name: member.account_name, p_number: member.number,
    });
    setBusy(null);
    if (error) {
      toast({ title: "保存できませんでした", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `パソコンからの発信は ${member.account_name} さんのスマホに通知します` });
    await reload();
  };

  const applyAsHpPhone = async (number: string) => {
    if (!storeId || !hpPhone) return;
    const digits = dialDigits(number);
    if (!window.confirm(`HP・Xの投稿などに出す電話番号を ${formatPhone(digits)} に変えますか？`)) return;
    setBusy("hp");
    const result = hpPhone.id
      ? await supabase.from("store_info" as never).update({ phone: formatPhone(digits) } as never).eq("id", hpPhone.id)
      : await supabase.from("store_info" as never).insert([{ store_id: storeId, phone: formatPhone(digits) }] as never);
    setBusy(null);
    if (result.error) {
      toast({ title: "変えられませんでした", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "HPの電話番号を変えました", description: "公開ページは開き直すと新しい番号になります" });
    await reload();
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-[60px] md:ml-[240px] p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-4 mt-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Phone size={20} />電話（SUBLINE）</h1>
            <p className="text-sm text-muted-foreground mt-1">
              SUBLINEとつなぐと、管理画面のお客様の電話番号から店の050番号で発信できます。
              スマホではSUBLINEアプリが開き、パソコンではスマホのSUBLINEに「発信してください」の通知が届きます。
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><KeyRound size={18} />アクセストークン</CardTitle>
              <CardDescription>
                SUBLINEの管理画面「外部連携管理 › API設定」で発行したアクセストークンを入れます。
                トークンは暗号化して保存し、この画面にも二度と表示しません。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                {settings?.token_registered
                  ? <Badge className="bg-emerald-600">登録済み</Badge>
                  : <Badge variant="outline">未登録</Badge>}
                {settings?.token_set_at && <span className="text-muted-foreground">登録 {formatDateTime(settings.token_set_at)}</span>}
              </div>
              {canManage ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={settings?.token_registered ? "差し替えるときだけ入力" : "アクセストークンを貼り付け"}
                    />
                    <Button onClick={() => void saveToken()} disabled={!token.trim() || busy !== null}>
                      {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "登録"}
                    </Button>
                  </div>
                  {settings?.token_registered && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void deleteToken()} disabled={busy !== null}>
                      <Trash2 className="h-4 w-4 mr-1" />連携をやめる
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">登録・変更は店長・オーナーができます。</p>
              )}
            </CardContent>
          </Card>

          {settings?.token_registered && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><PlugZap size={18} />接続の確認</CardTitle>
                <CardDescription>
                  SUBLINEのメンバーと050番号を読み込みます。パソコンから発信の通知を受けるには、
                  スマホのSUBLINEアプリで「設定 → 外部連携の設定」をオンにしてください。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button onClick={() => void check()} disabled={!canManage || busy !== null}>
                    {busy === "check" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlugZap className="h-4 w-4 mr-1" />}
                    接続を確認
                  </Button>
                  {settings.last_checked_at && (
                    <span className={`text-xs ${settings.last_check_ok ? "text-emerald-700" : "text-destructive"}`}>
                      {formatDateTime(settings.last_checked_at)} {settings.last_check_ok ? "接続できました" : settings.last_check_message}
                    </span>
                  )}
                </div>
                {checkError && <p className="text-sm text-destructive">{checkError}</p>}
                {members && members.length === 0 && <p className="text-sm text-muted-foreground">メンバーが見つかりませんでした。</p>}
                {members && members.length > 0 && (
                  <div className="divide-y rounded-lg border">
                    {members.map((member) => {
                      const chosen = settings.member_account_code === member.account_code;
                      const isHp = hpPhone && dialDigits(hpPhone.phone) === dialDigits(member.number);
                      return (
                        <div key={member.account_code} className="px-3 py-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{member.account_name}{member.group_name ? `（${member.group_name}）` : ""}</p>
                              <p className="text-lg font-bold tabular-nums">{member.number}</p>
                            </div>
                            {member.linked
                              ? <Badge className="bg-emerald-600 shrink-0"><Smartphone className="h-3 w-3 mr-1" />外部連携オン</Badge>
                              : <Badge variant="outline" className="shrink-0">外部連携オフ</Badge>}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant={chosen ? "default" : "outline"}
                              disabled={!member.linked || busy !== null}
                              onClick={() => void chooseMember(member)}
                            >
                              {chosen ? <CheckCircle2 className="h-4 w-4 mr-1" /> : null}
                              {chosen ? "パソコンからの発信の通知先" : "パソコンからの発信をこの人に通知"}
                            </Button>
                            <Button size="sm" variant="outline" disabled={Boolean(isHp) || busy !== null} onClick={() => void applyAsHpPhone(member.number)}>
                              {isHp ? "HPの電話番号になっています" : "この番号をHPの電話番号にする"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {hpPhone && (
                  <p className="text-xs text-muted-foreground">
                    今のHPの電話番号：{hpPhone.phone ? formatPhone(dialDigits(hpPhone.phone)) : "未設定（予備の番号を表示中）"}（「店舗情報」でも変えられます）
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">使い方</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1.5">
              <p>・WEB予約一覧・顧客カルテ・データベースのお客様の電話番号を押すと、店の050番号で発信します。</p>
              <p>・スマホ：SUBLINEアプリが開いて発信します（アプリが入っていてログイン済みのこと）。</p>
              <p>・パソコン：通知先のスマホに「発信してください」の通知が届きます。通知をタップすると発信します。</p>
              <p>・SUBLINEには着信や通話履歴を外に知らせる仕組みが無いため、着信の自動ポップや電話の問い合わせ件数の自動集計はできません。</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
