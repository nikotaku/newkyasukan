import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, MessageSquare, Sparkles, Loader2, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { StaffConcierge } from "@/components/StaffConcierge";

interface BoardPost {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
  is_pinned: boolean;
}

const MAX_CHARS = 140;

const Board = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [content, setContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { isAdmin, displayName } = useAuth();
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["board-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_posts")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BoardPost[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (post: { content: string; author_name: string; title: string }) => {
      const { error } = await supabase.from("board_posts").insert(post);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-posts"] });
      setContent("");
      toast.success("投稿しました");
    },
    onError: () => toast.error("投稿に失敗しました"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("board_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-posts"] });
      toast.success("削除しました");
    },
  });

  const pinMutation = useMutation({
    mutationFn: async ({ id, is_pinned }: { id: string; is_pinned: boolean }) => {
      const { error } = await supabase.from("board_posts").update({ is_pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-posts"] });
    },
    onError: () => toast.error("固定の更新に失敗しました"),
  });

  const handlePost = () => {
    if (!content.trim() || content.length > MAX_CHARS) return;
    createMutation.mutate({
      content: content.trim(),
      author_name: displayName || "管理者",
      title: "-",
    });
  };

  const handleAutoIntro = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-therapist-intro");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${data.therapist}の紹介を投稿しました！`);
      queryClient.invalidateQueries({ queryKey: ["board-posts"] });
    } catch (e: any) {
      toast.error(e.message || "自動紹介の生成に失敗しました");
    } finally {
      setIsGenerating(false);
    }
  };

  const remaining = MAX_CHARS - content.length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="md:ml-[180px] pt-[60px] p-4 max-w-xl mx-auto">
        <h1 className="text-lg font-bold mb-4">タイムライン</h1>

        {/* Post composer */}
        {isAdmin && (
          <div className="border-b border-border pb-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-muted-foreground">
                投稿者: {displayName || "管理者"}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                onClick={handleAutoIntro}
                disabled={isGenerating}
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                AI紹介投稿
              </Button>
            </div>
            <Textarea
              placeholder="いまどうしてる？"
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
              rows={3}
              className="resize-none text-sm border-none shadow-none focus-visible:ring-0 p-0"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${remaining < 20 ? "text-destructive" : "text-muted-foreground"}`}>
                {remaining}
              </span>
              <Button
                size="sm"
                className="rounded-full px-5"
                onClick={handlePost}
                disabled={!content.trim() || remaining < 0}
              >
                投稿する
              </Button>
            </div>
          </div>
        )}

        {/* Feed */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">読み込み中...</p>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">まだ投稿がありません</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {posts.map((post) => (
              <div key={post.id} className={`py-3 flex gap-3 ${post.is_pinned ? "bg-amber-50/60 -mx-2 px-2 rounded" : ""}`}>
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                  {post.author_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {post.is_pinned && <Pin size={12} className="text-amber-500 shrink-0" />}
                    <span className="font-semibold text-sm truncate">{post.author_name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ja })}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{post.content}</p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 shrink-0 self-start mt-1">
                    <button
                      onClick={() => pinMutation.mutate({ id: post.id, is_pinned: !post.is_pinned })}
                      className={`transition-colors ${post.is_pinned ? "text-amber-500 hover:text-muted-foreground" : "text-muted-foreground hover:text-amber-500"}`}
                      title={post.is_pinned ? "固定を解除" : "上部に固定"}
                    >
                      {post.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button
                      onClick={() => { if (confirm("削除しますか？")) deleteMutation.mutate(post.id); }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <StaffConcierge />
    </div>
  );
};

export default Board;
