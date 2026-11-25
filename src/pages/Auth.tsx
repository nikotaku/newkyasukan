import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import caskanLogo from "@/assets/caskan-logo.png";
import { ENKA_STORE_ID } from "@/lib/storeSwitch";

export default function Auth() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    document.title = "管理ログイン";
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") navigate("/dashboard");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: "saito.crow+enka@gmail.com", password });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          throw new Error("パスワードが正しくありません");
        }
        throw error;
      }
      try { localStorage.setItem("current_store_id", ENKA_STORE_ID); } catch { /* noop */ }
      toast({ title: "ログイン成功" });
    } catch (error) {
      toast({
        title: "ログインエラー",
        description: error instanceof Error ? error.message : "ログインに失敗しました",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#f5f5f5' }}>
      <div className="mb-6">
        <img src={caskanLogo} alt="Caskan" className="h-16" />
      </div>

      <div className="w-full max-w-[500px] bg-white rounded shadow-sm border border-gray-200">
        <div className="px-6 py-3 border-b border-gray-200" style={{ backgroundColor: '#fafafa' }}>
          <h2 className="text-base font-normal text-foreground">
            艶華 管理ログイン
          </h2>
        </div>

        <div className="px-6 py-5">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">パスワード</label>
                <input
                  type="password"
                  placeholder="パスワードを入力"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-gray-400"
                />
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="submit" disabled={loading}
                  className="px-12 py-2 rounded text-white text-sm font-normal disabled:opacity-50"
                  style={{ backgroundColor: '#6aab35' }}
                >
                  ログイン
                </button>
              </div>
            </form>
        </div>
      </div>

      <div className="mt-auto py-6 text-center text-xs text-gray-400">
        © 2026 caskan.jp All rights reserved
      </div>
    </div>
  );
}
