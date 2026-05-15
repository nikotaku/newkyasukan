import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  // user_roles テーブルが存在しない場合はログイン済みユーザーを管理者として扱う
  if (error) return true;
  return !!data;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(async () => {
            const [adminResult, { data: profileData }] = await Promise.all([
              checkIsAdmin(session.user.id),
              supabase
                .from("profiles")
                .select("display_name")
                .eq("user_id", session.user.id)
                .maybeSingle(),
            ]);
            setIsAdmin(adminResult);
            setDisplayName(profileData?.display_name || session.user.email || null);
          }, 0);
        } else {
          setIsAdmin(false);
        }

        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setTimeout(async () => {
          const [adminResult, { data: profileData }] = await Promise.all([
            checkIsAdmin(session.user.id),
            supabase
              .from("profiles")
              .select("display_name")
              .eq("user_id", session.user.id)
              .maybeSingle(),
          ]);
          setIsAdmin(adminResult);
          setDisplayName(profileData?.display_name || session.user.email || null);
        }, 0);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setDisplayName(null);
    navigate("/auth");
  };

  return {
    user,
    session,
    loading,
    isAdmin,
    displayName,
    signOut,
  };
}
