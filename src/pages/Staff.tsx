import { useState, useEffect, useRef } from "react";
import { Plus, Edit, Trash2, Search, Filter, Camera, Clock, TrendingUp, Sparkles, Link as LinkIcon, Copy, Eye, EyeOff, CalendarPlus, GripVertical, FileUp, X } from "lucide-react";
import { driveImgUrl } from "@/lib/drive";
import { ImportModal } from "@/components/ImportModal";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const THERAPIST_FEATURES = [
  "人妻", "お姉さん系", "清楚系", "癒し系", "S系", "M系",
  "ポッチャリ", "スレンダー", "モデル系", "巨乳", "パイパン", "学生",
  "人見知り", "社交的", "甘えん坊", "ガールズトーク", "話し上手", "サービス旺盛",
  "スキンシップ多め", "アイドル系", "フェロモン系", "外国人系", "エステ", "可愛い", "綺麗", "小柄",
];

const THERAPIST_EXPERIENCE_OPTIONS = ["1年未満", "1〜3年", "3〜5年", "5年以上"];
const BLOOD_TYPES = ["A", "B", "O", "AB"];
const BUST_SIZES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

interface Cast {
  id: string;
  name: string;
  name_kana: string | null;
  name_en: string | null;
  type: string;
  status: string;
  photo: string | null;
  photos: string[] | null;
  profile: string | null;
  room: string | null;
  execution_date_start: string | null;
  execution_date_end: string | null;
  hp_notice: string | null;
  upload_check: string | null;
  x_account: string | null;
  message: string | null;
  line_url: string | null;
  litlink_url: string | null;
  o2_url: string | null;
  join_date: string;
  access_token?: string | null;
  therapist_years: number | null;
  therapist_experience: string | null;
  favorite_techniques: string | null;
  favorite_food: string | null;
  ideal_partner: string | null;
  follow_list: string | null;
  media_registration: string[] | null;
  marks: string[] | null;
  features: string[] | null;
  files: string[] | null;
  registration_sheet: string | null;
  format_type: string | null;
  recent_dispatch_details: string | null;
  memo: string | null;
  dispatch_status: string | null;
  repeat_scheduled: boolean | null;
  is_visible: boolean;
  display_order?: number;
  blood_type: string | null;
  height: number | null;
  weight: number | null;
  bust_size: string | null;
  shop_comment: string | null;
  therapist_comment: string | null;
  age: number | null;
  hometown: string | null;
  birth_date: string | null;
  body_size: string | null;
  enrollment_period: string | null;
  hobby: string | null;
  celebrity_like: string | null;
  uses_sns: boolean | null;
  blog_url: string | null;
  skebiy_url: string | null;
  instagram_url: string | null;
}

export default function Staff() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCast, setEditingCast] = useState<Cast | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingContent, setGeneratingContent] = useState(false);
  
  const emptyForm = {
    name: "",
    name_kana: "",
    name_en: "",
    type: "インルーム",
    room: "インルーム",
    status: "未着手",
    profile: "",
    photo: "",
    photos: [] as string[],
    blood_type: "",
    height: "" as string | number,
    weight: "" as string | number,
    bust_size: "",
    shop_comment: "",
    therapist_comment: "",
    features: [] as string[],
    therapist_experience: "",
    favorite_techniques: "",
    age: "" as string | number,
    hometown: "",
    birth_date: "",
    body_size: "",
    enrollment_period: "",
    favorite_food: "",
    ideal_partner: "",
    celebrity_like: "",
    uses_sns: false,
    hobby: "",
    blog_url: "",
    x_account: "",
    skebiy_url: "",
    instagram_url: "",
    therapist_years: 0,
    follow_list: "",
    media_registration: [] as string[],
    marks: [] as string[],
    files: [] as string[],
    registration_sheet: "",
    format_type: "",
    recent_dispatch_details: "",
    memo: "",
    dispatch_status: "none",
    repeat_scheduled: false,
  };
  // フォーム用の状態
  const [formData, setFormData] = useState({ ...emptyForm });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const dragCastId = useRef<string | null>(null);
  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();

  // 認証チェック
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // キャストデータを取得
  useEffect(() => {
    fetchCasts();
    
    // リアルタイム更新を購読
    const channel = supabase
      .channel('casts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'casts'
        },
        () => {
          fetchCasts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCasts = async () => {
    try {
      const { data, error } = await supabase
        .from('casts')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCasts((data || []) as Cast[]);
    } catch (error) {
      console.error('Error fetching casts:', error);
      toast({
        title: "エラー",
        description: "キャスト情報の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCasts = casts.filter(cast =>
    cast.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddCast = async () => {
    if (!isAdmin) {
      toast({
        title: "権限エラー",
        description: "管理者のみキャストを追加できます",
        variant: "destructive",
      });
      return;
    }

    try {
      // Step 1: insert base fields
      const { data: inserted, error } = await supabase
        .from('casts')
        .insert([{
          name: formData.name,
          type: formData.type,
          room: formData.room,
          status: formData.status,
          profile: formData.therapist_comment || formData.profile || null,
          photo: formData.photos[0] || null,
          photos: formData.photos.length > 0 ? formData.photos : null,
          x_account: formData.x_account || null,
          therapist_years: formData.therapist_years || null,
          favorite_techniques: formData.favorite_techniques || null,
          favorite_food: formData.favorite_food || null,
          ideal_partner: formData.ideal_partner || null,
          follow_list: formData.follow_list || null,
          media_registration: formData.media_registration.length > 0 ? formData.media_registration : null,
          marks: formData.marks.length > 0 ? formData.marks : null,
          files: formData.files.length > 0 ? formData.files : null,
          registration_sheet: formData.registration_sheet || null,
          format_type: formData.format_type || null,
          recent_dispatch_details: formData.recent_dispatch_details || null,
          memo: formData.memo || null,
          dispatch_status: formData.dispatch_status || 'none',
          repeat_scheduled: formData.repeat_scheduled || false,
        }])
        .select('id')
        .single();

      if (error) throw error;

      // Step 2: update new profile fields (silent fail if migration not run)
      if (inserted?.id) {
        await supabase.from('casts').update({
          name_kana: formData.name_kana || null,
          name_en: formData.name_en || null,
          blood_type: formData.blood_type || null,
          height: formData.height !== "" ? Number(formData.height) : null,
          weight: formData.weight !== "" ? Number(formData.weight) : null,
          bust_size: formData.bust_size || null,
          shop_comment: formData.shop_comment || null,
          therapist_comment: formData.therapist_comment || null,
          features: formData.features.length > 0 ? formData.features : null,
          therapist_experience: formData.therapist_experience || null,
          age: formData.age !== "" ? Number(formData.age) : null,
          hometown: formData.hometown || null,
          birth_date: formData.birth_date || null,
          body_size: formData.body_size || null,
          enrollment_period: formData.enrollment_period || null,
          hobby: formData.hobby || null,
          celebrity_like: formData.celebrity_like || null,
          uses_sns: formData.uses_sns || false,
          blog_url: formData.blog_url || null,
          skebiy_url: formData.skebiy_url || null,
          instagram_url: formData.instagram_url || null,
        }).eq('id', inserted.id);
      }

      toast({ title: "追加しました", description: "新しいセラピストが登録されました" });
      setIsAddDialogOpen(false);
      setFormData({ ...emptyForm });
    } catch (error: any) {
      console.error('Error adding cast:', error);
      toast({
        title: "エラー",
        description: error?.message || "キャストの追加に失敗しました",
        variant: "destructive",
      });
    }
  };

  const handleEditCast = async (cast: Cast) => {
    console.log('handleEditCast called', { cast, isAdmin });
    
    // 最新のデータを取得してから編集ダイアログを開く
    try {
      const { data, error } = await supabase
        .from('casts')
        .select('*')
        .eq('id', cast.id)
        .single();
      
      if (error) throw error;
      
      setEditingCast(data as Cast);
      setIsEditDialogOpen(true);
      console.log('Dialog opened with latest data:', data);
    } catch (error) {
      console.error('Error fetching latest cast data:', error);
      // エラーの場合は渡されたcastデータを使用
      setEditingCast(cast);
      setIsEditDialogOpen(true);
    }
  };

  const handleUpdateCast = async () => {
    if (!isAdmin || !editingCast) {
      toast({
        title: "権限エラー",
        description: "管理者のみキャストを更新できます",
        variant: "destructive",
      });
      return;
    }

    try {
      const photos = editingCast.photos || [];

      // Step 1: update base fields (always exist in DB)
      const basePayload: Record<string, any> = {
        name: editingCast.name,
        type: editingCast.type,
        room: editingCast.room,
        status: editingCast.status,
        profile: editingCast.therapist_comment || editingCast.profile || null,
        photo: photos.length > 0 ? photos[0] : null,
        photos: photos.length > 0 ? photos : null,
        x_account: editingCast.x_account || null,
        message: editingCast.message || null,
        line_url: editingCast.line_url || null,
        litlink_url: editingCast.litlink_url || null,
        o2_url: editingCast.o2_url || null,
        hp_notice: editingCast.hp_notice || null,
        therapist_years: editingCast.therapist_years || null,
        favorite_techniques: editingCast.favorite_techniques || null,
        favorite_food: editingCast.favorite_food || null,
        ideal_partner: editingCast.ideal_partner || null,
        follow_list: editingCast.follow_list || null,
        media_registration: editingCast.media_registration || null,
        marks: editingCast.marks || null,
        files: editingCast.files || null,
        registration_sheet: editingCast.registration_sheet || null,
        format_type: editingCast.format_type || null,
        recent_dispatch_details: editingCast.recent_dispatch_details || null,
        memo: editingCast.memo || null,
        dispatch_status: editingCast.dispatch_status || 'none',
        repeat_scheduled: editingCast.repeat_scheduled || false,
        is_visible: editingCast.is_visible,
      };
      const { error: baseError } = await supabase.from('casts').update(basePayload).eq('id', editingCast.id);
      if (baseError) throw baseError;

      // Step 2: update new profile fields (requires migration SQL) — silent fail if columns missing
      const profilePayload: Record<string, any> = {
        name_kana: editingCast.name_kana || null,
        name_en: editingCast.name_en || null,
        blood_type: editingCast.blood_type || null,
        height: editingCast.height || null,
        weight: editingCast.weight || null,
        bust_size: editingCast.bust_size || null,
        shop_comment: editingCast.shop_comment || null,
        therapist_comment: editingCast.therapist_comment || null,
        features: editingCast.features || null,
        therapist_experience: editingCast.therapist_experience || null,
        age: editingCast.age || null,
        hometown: editingCast.hometown || null,
        birth_date: editingCast.birth_date || null,
        body_size: editingCast.body_size || null,
        enrollment_period: editingCast.enrollment_period || null,
        hobby: editingCast.hobby || null,
        celebrity_like: editingCast.celebrity_like || null,
        uses_sns: editingCast.uses_sns || false,
        blog_url: editingCast.blog_url || null,
        skebiy_url: editingCast.skebiy_url || null,
        instagram_url: editingCast.instagram_url || null,
      };
      const { error: profileError } = await supabase.from('casts').update(profilePayload).eq('id', editingCast.id);
      if (profileError) {
        console.warn('Profile fields not saved (migration may be needed):', profileError.message);
        toast({
          title: "基本情報を保存しました",
          description: "新プロフィール項目の保存にはDBマイグレーションが必要です",
        });
      } else {
        toast({ title: "保存しました", description: "セラピスト情報を更新しました" });
      }

      setIsEditDialogOpen(false);
      setEditingCast(null);
    } catch (error: any) {
      console.error('Error updating cast:', error);
      toast({
        title: "エラー",
        description: error?.message || "キャストの更新に失敗しました",
        variant: "destructive",
      });
    }
  };

  const handleGenerateContent = async (type: 'profile' | 'announcement' | 'catchphrase') => {
    if (!editingCast) return;
    
    setGeneratingContent(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-cast-content', {
        body: {
          type,
          castName: editingCast.name,
          castType: editingCast.type,
          existingProfile: type === 'profile' ? editingCast.profile : null
        }
      });

      if (error) throw error;

      if (data?.content) {
        if (type === 'profile') {
          setEditingCast({ ...editingCast, profile: data.content });
        } else if (type === 'announcement') {
          setEditingCast({ ...editingCast, hp_notice: data.content });
        }
        
        toast({
          title: "AI生成完了",
          description: `${type === 'profile' ? 'プロフィール' : type === 'announcement' ? 'お知らせ' : 'キャッチコピー'}を生成しました`,
        });
      }
    } catch (error) {
      console.error('Error generating content:', error);
      toast({
        title: "エラー",
        description: "コンテンツの生成に失敗しました",
        variant: "destructive",
      });
    } finally {
      setGeneratingContent(false);
    }
  };

  const handleDeleteCast = async (id: string) => {
    if (!isAdmin) {
      toast({
        title: "権限エラー",
        description: "管理者のみキャストを削除できます",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('casts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // ローカルステートから削除されたキャストを除外
      setCasts(prevCasts => prevCasts.filter(cast => cast.id !== id));

      toast({
        title: "キャスト削除",
        description: "キャストが削除されました",
      });
      
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Error deleting cast:', error);
      toast({
        title: "エラー",
        description: "キャストの削除に失敗しました",
        variant: "destructive",
      });
    }
  };

  const handleDropCast = async (targetId: string) => {
    if (!isAdmin || !dragCastId.current || dragCastId.current === targetId) return;
    const fromIdx = casts.findIndex(c => c.id === dragCastId.current);
    const toIdx = casts.findIndex(c => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...casts];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setCasts(reordered);
    dragCastId.current = null;
    try {
      await Promise.all(
        reordered.map((c, i) =>
          supabase.from('casts').update({ display_order: i + 1 }).eq('id', c.id)
        )
      );
    } catch (e) {
      console.error('reorder failed', e);
      toast({ title: '並び替えに失敗しました', variant: 'destructive' });
      fetchCasts();
    }
  };

  const generateAccessToken = async (castId: string) => {
    if (!isAdmin) {
      toast({
        title: "権限エラー",
        description: "管理者のみトークンを生成できます",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = crypto.randomUUID();
      const { error } = await supabase
        .from('casts')
        .update({ access_token: token })
        .eq('id', castId);

      if (error) throw error;

      toast({
        title: "トークン生成完了",
        description: "専用リンクが生成されました",
      });
      fetchCasts();
    } catch (error) {
      console.error('Error generating token:', error);
      toast({
        title: "エラー",
        description: "トークンの生成に失敗しました",
        variant: "destructive",
      });
    }
  };

  const copyPortalLink = (token: string) => {
    const link = `${import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin}/therapist/${token}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "リンクをコピーしました",
      description: "専用ページのリンクがクリップボードにコピーされました",
    });
  };

  const copyShiftLink = (token: string) => {
    const link = `${window.location.origin}/therapist/${token}/shift`;
    navigator.clipboard.writeText(link);
    toast({
      title: "シフト提出URLをコピーしました",
      description: "セラピストに送付してください",
    });
  };

  const addPhotoUrl = (url: string, isEdit: boolean) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (isEdit && editingCast) {
      const updated = [...(editingCast.photos || []), trimmed];
      setEditingCast({ ...editingCast, photos: updated, photo: updated[0] });
    } else {
      const updated = [...formData.photos, trimmed];
      setFormData({ ...formData, photos: updated, photo: updated[0] });
    }
    setNewPhotoUrl("");
  };

  const handlePhotoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("cast-photos")
          .upload(fileName, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast({
            title: "エラー",
            description: `${file.name}のアップロードに失敗しました`,
            variant: "destructive",
          });
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from("cast-photos")
          .getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }

      if (uploadedUrls.length > 0) {
        if (isEdit && editingCast) {
          const updated = [...(editingCast.photos || []), ...uploadedUrls];
          setEditingCast({ ...editingCast, photos: updated, photo: updated[0] });
        } else {
          const updated = [...formData.photos, ...uploadedUrls];
          setFormData({ ...formData, photos: updated, photo: updated[0] });
        }
        toast({
          title: "アップロード完了",
          description: `${uploadedUrls.length}枚の写真をアップロードしました`,
        });
      }
    } catch (error) {
      console.error("Error uploading photos:", error);
      toast({
        title: "エラー",
        description: "写真のアップロードに失敗しました",
        variant: "destructive",
      });
    } finally {
      setUploadingPhoto(false);
      if (isEdit) {
        if (editPhotoInputRef.current) editPhotoInputRef.current.value = "";
      } else {
        if (addPhotoInputRef.current) addPhotoInputRef.current.value = "";
      }
    }
  };

  const handleRemovePhoto = (index: number, isEdit: boolean = false) => {
    if (isEdit && editingCast) {
      const updatedPhotos = (editingCast.photos || []).filter((_, i) => i !== index);
      setEditingCast({
        ...editingCast,
        photos: updatedPhotos,
        photo: updatedPhotos[0] || null
      });
    } else {
      const updatedPhotos = formData.photos.filter((_, i) => i !== index);
      setFormData({
        ...formData,
        photos: updatedPhotos,
        photo: updatedPhotos[0] || ""
      });
    }
    
    toast({
      title: "写真削除",
      description: "写真を削除しました",
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
      
      <div className="flex pt-[60px]">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        
        <main className="flex-1 p-4 md:p-6 md:ml-[240px] overflow-x-hidden">
          <div className="max-w-7xl mx-auto">
            <Tabs defaultValue="management" className="w-full">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h1 className="text-2xl font-bold">キャスト管理</h1>
                  <p className="text-muted-foreground">キャストの登録・管理</p>
                </div>
                
                <div className="flex gap-2 items-center">
                  {isAdmin && (
                    <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                      <FileUp size={16} />
                      CSVインポート
                    </Button>
                  )}
                  {isAdmin && (
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus size={16} />
                          新規追加
                        </Button>
                      </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>新しいセラピストを追加</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 pb-4">
                      {/* 写真 */}
                      <div>
                        <Label className="font-semibold">セラピスト写真</Label>
                        <div className="mt-2 space-y-2">
                          <input
                            ref={addPhotoInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => handlePhotoFileUpload(e, false)}
                          />
                          <Button type="button" variant="outline" className="w-full" onClick={() => addPhotoInputRef.current?.click()} disabled={uploadingPhoto}>
                            <Camera className="h-4 w-4 mr-1.5" />
                            {uploadingPhoto ? "アップロード中..." : "写真をアップロード"}
                          </Button>
                          <div className="flex gap-2">
                            <Input
                              placeholder="またはGoogleドライブURL / ファイルID"
                              value={newPhotoUrl}
                              onChange={(e) => setNewPhotoUrl(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhotoUrl(newPhotoUrl, false))}
                            />
                            <Button type="button" variant="outline" onClick={() => addPhotoUrl(newPhotoUrl, false)} disabled={!newPhotoUrl.trim()}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {Array.from({ length: 6 }).map((_, index) => {
                              const photo = formData.photos[index];
                              return (
                                <div key={index} className="relative aspect-square border-2 border-dashed border-muted rounded-md overflow-hidden flex items-center justify-center bg-muted/30">
                                  {photo ? (
                                    <>
                                      <img src={driveImgUrl(photo)} alt={`写真${index + 1}`} className="w-full h-full object-cover" />
                                      <Button type="button" variant="destructive" size="sm" className="absolute top-1 right-1 h-6 w-6 p-0" onClick={() => handleRemovePhoto(index, false)}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                      <Badge variant="secondary" className="absolute bottom-1 left-1 text-[10px] px-1">{index + 1}</Badge>
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">写真{index + 1}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* ショップコメント */}
                      <div>
                        <Label htmlFor="add-shop-comment" className="font-semibold">ショップコメント</Label>
                        <Textarea id="add-shop-comment" rows={3} className="mt-1" value={formData.shop_comment} onChange={(e) => setFormData({...formData, shop_comment: e.target.value})} />
                      </div>

                      {/* 基本情報 */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <Label className="font-semibold">基本情報</Label>
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <Label htmlFor="add-name">名前 <span className="text-destructive">*</span></Label>
                            <Input id="add-name" placeholder="例：さくら" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                          </div>
                          <div>
                            <Label htmlFor="add-name-kana">フリガナ</Label>
                            <Input id="add-name-kana" placeholder="例：サクラ" value={formData.name_kana} onChange={(e) => setFormData({...formData, name_kana: e.target.value})} />
                          </div>
                          <div>
                            <Label htmlFor="add-name-en">英語表記</Label>
                            <Input id="add-name-en" placeholder="例：SAKURA" value={formData.name_en} onChange={(e) => setFormData({...formData, name_en: e.target.value})} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label>血液型</Label>
                            <Select value={formData.blood_type} onValueChange={(v) => setFormData({...formData, blood_type: v})}>
                              <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                              <SelectContent>{BLOOD_TYPES.map(b => <SelectItem key={b} value={b}>{b}型</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="add-height">身長 (cm)</Label>
                            <Input id="add-height" type="number" placeholder="158" value={formData.height} onChange={(e) => setFormData({...formData, height: e.target.value})} />
                          </div>
                          <div>
                            <Label htmlFor="add-weight">体重 (kg)</Label>
                            <Input id="add-weight" type="number" placeholder="48" value={formData.weight} onChange={(e) => setFormData({...formData, weight: e.target.value})} />
                          </div>
                        </div>
                        <div>
                          <Label>バストのカップ数</Label>
                          <Select value={formData.bust_size} onValueChange={(v) => setFormData({...formData, bust_size: v})}>
                            <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                            <SelectContent>{BUST_SIZES.map(b => <SelectItem key={b} value={b}>{b}カップ</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* セラピストコメント */}
                      <div>
                        <Label htmlFor="add-therapist-comment" className="font-semibold">セラピストコメント</Label>
                        <Textarea id="add-therapist-comment" rows={3} className="mt-1" value={formData.therapist_comment} onChange={(e) => setFormData({...formData, therapist_comment: e.target.value})} />
                      </div>

                      {/* セラピストの特徴 */}
                      <div>
                        <Label className="font-semibold">セラピストの特徴</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {THERAPIST_FEATURES.map((f) => {
                            const checked = formData.features.includes(f);
                            return (
                              <button key={f} type="button"
                                className={`px-2 py-1 text-xs rounded-full border transition-colors ${checked ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 text-muted-foreground hover:border-primary"}`}
                                onClick={() => setFormData({...formData, features: checked ? formData.features.filter(x => x !== f) : [...formData.features, f]})}>
                                {f}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* エステ歴 */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="font-semibold">エステ歴</Label>
                          <Select value={formData.therapist_experience} onValueChange={(v) => setFormData({...formData, therapist_experience: v})}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="選択" /></SelectTrigger>
                            <SelectContent>{THERAPIST_EXPERIENCE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="add-age" className="font-semibold">年齢</Label>
                          <Input id="add-age" type="number" placeholder="25" className="mt-1" value={formData.age} onChange={(e) => setFormData({...formData, age: e.target.value})} />
                        </div>
                      </div>

                      {/* 特技 */}
                      <div>
                        <Label htmlFor="add-techniques" className="font-semibold">特技</Label>
                        <Textarea id="add-techniques" rows={2} className="mt-1" placeholder="得意な施術・特技..." value={formData.favorite_techniques} onChange={(e) => setFormData({...formData, favorite_techniques: e.target.value})} />
                      </div>

                      {/* スタイル */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <Label className="font-semibold">スタイル</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="add-hometown">出身</Label>
                            <Input id="add-hometown" placeholder="東京都" value={formData.hometown} onChange={(e) => setFormData({...formData, hometown: e.target.value})} />
                          </div>
                          <div>
                            <Label htmlFor="add-birth-date">生年月日</Label>
                            <Input id="add-birth-date" type="date" value={formData.birth_date} onChange={(e) => setFormData({...formData, birth_date: e.target.value})} />
                          </div>
                          <div>
                            <Label htmlFor="add-body-size">サイズ (T/W/H)</Label>
                            <Input id="add-body-size" placeholder="158/58/84" value={formData.body_size} onChange={(e) => setFormData({...formData, body_size: e.target.value})} />
                          </div>
                        </div>
                      </div>

                      {/* ブログ・SNS */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <Label className="font-semibold">ブログ・SNS</Label>
                        <div>
                          <Label htmlFor="add-blog">外部ブログ</Label>
                          <Input id="add-blog" placeholder="https://..." value={formData.blog_url} onChange={(e) => setFormData({...formData, blog_url: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="add-x">X (Twitter)</Label>
                          <Input id="add-x" placeholder="@username" value={formData.x_account} onChange={(e) => setFormData({...formData, x_account: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="add-skebiy">Skebiy</Label>
                          <Input id="add-skebiy" placeholder="https://..." value={formData.skebiy_url} onChange={(e) => setFormData({...formData, skebiy_url: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="add-instagram">Instagram</Label>
                          <Input id="add-instagram" placeholder="https://..." value={formData.instagram_url} onChange={(e) => setFormData({...formData, instagram_url: e.target.value})} />
                        </div>
                      </div>

                      <Button onClick={handleAddCast} className="w-full" disabled={!formData.name.trim()}>
                        追加する
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              </div>
            </div>

            {/* Edit Dialog */}
            {editingCast && (
              <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>セラピスト編集</DialogTitle>
                  </DialogHeader>
                  <Tabs defaultValue="profile" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-2">
                      <TabsTrigger value="profile">プロフィール</TabsTrigger>
                      <TabsTrigger value="mgmt">管理情報</TabsTrigger>
                    </TabsList>

                    <TabsContent value="profile" className="space-y-5 pb-4">
                      {/* 写真 */}
                      <div>
                        <Label className="font-semibold">セラピスト写真</Label>
                        <div className="mt-2 space-y-2">
                          <input
                            ref={editPhotoInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => handlePhotoFileUpload(e, true)}
                          />
                          <Button type="button" variant="outline" className="w-full" onClick={() => editPhotoInputRef.current?.click()} disabled={uploadingPhoto}>
                            <Camera className="h-4 w-4 mr-1.5" />
                            {uploadingPhoto ? "アップロード中..." : "写真をアップロード"}
                          </Button>
                          <div className="flex gap-2">
                            <Input
                              placeholder="またはGoogleドライブURL / ファイルID"
                              value={newPhotoUrl}
                              onChange={(e) => setNewPhotoUrl(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhotoUrl(newPhotoUrl, true))}
                            />
                            <Button type="button" variant="outline" onClick={() => addPhotoUrl(newPhotoUrl, true)} disabled={!newPhotoUrl.trim()}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {Array.from({ length: 6 }).map((_, index) => {
                              const photo = (editingCast.photos || [])[index];
                              return (
                                <div key={index} className="relative aspect-square border-2 border-dashed border-muted rounded-md overflow-hidden flex items-center justify-center bg-muted/30">
                                  {photo ? (
                                    <>
                                      <img src={driveImgUrl(photo)} alt={`写真${index + 1}`} className="w-full h-full object-cover" />
                                      <Button type="button" variant="destructive" size="sm" className="absolute top-1 right-1 h-6 w-6 p-0" onClick={() => handleRemovePhoto(index, true)}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                      <Badge variant="secondary" className="absolute bottom-1 left-1 text-[10px] px-1">{index + 1}</Badge>
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">写真{index + 1}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* ショップコメント */}
                      <div>
                        <Label htmlFor="e-shop-comment" className="font-semibold">ショップコメント</Label>
                        <Textarea id="e-shop-comment" rows={3} className="mt-1" value={editingCast.shop_comment || ""} onChange={(e) => setEditingCast({...editingCast, shop_comment: e.target.value})} />
                      </div>

                      {/* 基本情報 */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <Label className="font-semibold">基本情報</Label>
                        <div>
                          <Label htmlFor="e-name">名前</Label>
                          <Input id="e-name" value={editingCast.name} onChange={(e) => setEditingCast({...editingCast, name: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="e-name-kana">フリガナ</Label>
                          <Input id="e-name-kana" value={editingCast.name_kana || ""} onChange={(e) => setEditingCast({...editingCast, name_kana: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="e-name-en">英語表記</Label>
                          <Input id="e-name-en" value={editingCast.name_en || ""} onChange={(e) => setEditingCast({...editingCast, name_en: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label>血液型</Label>
                            <Select value={editingCast.blood_type || ""} onValueChange={(v) => setEditingCast({...editingCast, blood_type: v})}>
                              <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                              <SelectContent>{BLOOD_TYPES.map(b => <SelectItem key={b} value={b}>{b}型</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="e-height">身長 (cm)</Label>
                            <Input id="e-height" type="number" value={editingCast.height || ""} onChange={(e) => setEditingCast({...editingCast, height: parseInt(e.target.value) || null})} />
                          </div>
                          <div>
                            <Label htmlFor="e-weight">体重 (kg)</Label>
                            <Input id="e-weight" type="number" value={editingCast.weight || ""} onChange={(e) => setEditingCast({...editingCast, weight: parseInt(e.target.value) || null})} />
                          </div>
                        </div>
                        <div>
                          <Label>バストのカップ数</Label>
                          <Select value={editingCast.bust_size || ""} onValueChange={(v) => setEditingCast({...editingCast, bust_size: v})}>
                            <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                            <SelectContent>{BUST_SIZES.map(b => <SelectItem key={b} value={b}>{b}カップ</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* セラピストコメント */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label htmlFor="e-therapist-comment" className="font-semibold">セラピストコメント</Label>
                          <Button type="button" variant="outline" size="sm" onClick={() => handleGenerateContent('profile')} disabled={generatingContent}>
                            <Sparkles className="w-4 h-4 mr-1" />AI生成
                          </Button>
                        </div>
                        <Textarea id="e-therapist-comment" rows={3} value={editingCast.therapist_comment || editingCast.profile || ""} onChange={(e) => setEditingCast({...editingCast, therapist_comment: e.target.value, profile: e.target.value})} />
                      </div>

                      {/* セラピストの特徴 */}
                      <div>
                        <Label className="font-semibold">セラピストの特徴</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {THERAPIST_FEATURES.map((f) => {
                            const checked = (editingCast.features || []).includes(f);
                            return (
                              <button key={f} type="button"
                                className={`px-2 py-1 text-xs rounded-full border transition-colors ${checked ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 text-muted-foreground hover:border-primary"}`}
                                onClick={() => setEditingCast({...editingCast, features: checked ? (editingCast.features || []).filter(x => x !== f) : [...(editingCast.features || []), f]})}>
                                {f}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* エステ歴・年齢 */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="font-semibold">エステ歴</Label>
                          <Select value={editingCast.therapist_experience || ""} onValueChange={(v) => setEditingCast({...editingCast, therapist_experience: v})}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="選択" /></SelectTrigger>
                            <SelectContent>{THERAPIST_EXPERIENCE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="e-age" className="font-semibold">年齢</Label>
                          <Input id="e-age" type="number" className="mt-1" value={editingCast.age || ""} onChange={(e) => setEditingCast({...editingCast, age: parseInt(e.target.value) || null})} />
                        </div>
                      </div>

                      {/* 特技 */}
                      <div>
                        <Label htmlFor="e-techniques" className="font-semibold">特技</Label>
                        <Textarea id="e-techniques" rows={2} className="mt-1" value={editingCast.favorite_techniques || ""} onChange={(e) => setEditingCast({...editingCast, favorite_techniques: e.target.value})} />
                      </div>

                      {/* スタイル */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <Label className="font-semibold">スタイル</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="e-hometown">出身</Label>
                            <Input id="e-hometown" value={editingCast.hometown || ""} onChange={(e) => setEditingCast({...editingCast, hometown: e.target.value})} />
                          </div>
                          <div>
                            <Label htmlFor="e-birth-date">生年月日</Label>
                            <Input id="e-birth-date" type="date" value={editingCast.birth_date || ""} onChange={(e) => setEditingCast({...editingCast, birth_date: e.target.value})} />
                          </div>
                          <div>
                            <Label htmlFor="e-body-size">サイズ (T/W/H)</Label>
                            <Input id="e-body-size" placeholder="158/58/84" value={editingCast.body_size || ""} onChange={(e) => setEditingCast({...editingCast, body_size: e.target.value})} />
                          </div>
                        </div>
                      </div>

                      {/* ブログ・SNS */}
                      <div className="border rounded-lg p-4 space-y-3">
                        <Label className="font-semibold">ブログ・SNS</Label>
                        <div>
                          <Label htmlFor="e-blog">外部ブログ</Label>
                          <Input id="e-blog" placeholder="https://..." value={editingCast.blog_url || ""} onChange={(e) => setEditingCast({...editingCast, blog_url: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="e-x">X (Twitter)</Label>
                          <Input id="e-x" placeholder="@username" value={editingCast.x_account || ""} onChange={(e) => setEditingCast({...editingCast, x_account: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="e-skebiy">Skebiy</Label>
                          <Input id="e-skebiy" placeholder="https://..." value={editingCast.skebiy_url || ""} onChange={(e) => setEditingCast({...editingCast, skebiy_url: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="e-instagram">Instagram</Label>
                          <Input id="e-instagram" placeholder="https://..." value={editingCast.instagram_url || ""} onChange={(e) => setEditingCast({...editingCast, instagram_url: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="e-line-url">LINE URL</Label>
                          <Input id="e-line-url" placeholder="https://lin.ee/..." value={editingCast.line_url || ""} onChange={(e) => setEditingCast({...editingCast, line_url: e.target.value})} />
                        </div>
                        <div>
                          <Label htmlFor="e-litlink">リットリンク URL</Label>
                          <Input id="e-litlink" placeholder="https://lit.link/..." value={editingCast.litlink_url || ""} onChange={(e) => setEditingCast({...editingCast, litlink_url: e.target.value})} />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="mgmt" className="space-y-4 pb-4">
                      <div className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-2">
                          {editingCast.is_visible ? <Eye className="h-4 w-4 text-green-600" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                          <Label>HP表示</Label>
                        </div>
                        <Button type="button" variant={editingCast.is_visible ? "default" : "outline"} size="sm" onClick={() => setEditingCast({...editingCast, is_visible: !editingCast.is_visible})}>
                          {editingCast.is_visible ? "ON" : "OFF"}
                        </Button>
                      </div>

                      <div>
                        <Label>派遣ステータス</Label>
                        <Select value={editingCast.dispatch_status || "none"} onValueChange={(v) => setEditingCast({...editingCast, dispatch_status: v})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">未設定</SelectItem>
                            <SelectItem value="scheduled">派遣予定</SelectItem>
                            <SelectItem value="dispatched">派遣中</SelectItem>
                            <SelectItem value="completed">完了</SelectItem>
                            <SelectItem value="cancelled">キャンセル</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>HP告知</Label>
                        <div className="flex justify-end mb-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => handleGenerateContent('announcement')} disabled={generatingContent}>
                            <Sparkles className="w-4 h-4 mr-1" />AI生成
                          </Button>
                        </div>
                        <Textarea rows={3} value={editingCast.hp_notice || ""} onChange={(e) => setEditingCast({...editingCast, hp_notice: e.target.value})} />
                      </div>

                      <div>
                        <Label>媒体登録（カンマ区切り）</Label>
                        <Input placeholder="キャスカン, エスタマ" value={(editingCast.media_registration || []).join(", ")} onChange={(e) => setEditingCast({...editingCast, media_registration: e.target.value.split(",").map(s => s.trim()).filter(s => s)})} />
                      </div>

                      <div>
                        <Label>マーク一覧（カンマ区切り）</Label>
                        <Input placeholder="【エスたま】新人" value={(editingCast.marks || []).join(", ")} onChange={(e) => setEditingCast({...editingCast, marks: e.target.value.split(",").map(s => s.trim()).filter(s => s)})} />
                      </div>

                      <div>
                        <Label>登録シート URL</Label>
                        <Input value={editingCast.registration_sheet || ""} onChange={(e) => setEditingCast({...editingCast, registration_sheet: e.target.value})} />
                      </div>

                      <div>
                        <Label>口コミ（O2）URL</Label>
                        <Input placeholder="https://..." value={editingCast.o2_url || ""} onChange={(e) => setEditingCast({...editingCast, o2_url: e.target.value})} />
                      </div>

                      <div>
                        <Label>直近派遣詳細</Label>
                        <Textarea rows={3} value={editingCast.recent_dispatch_details || ""} onChange={(e) => setEditingCast({...editingCast, recent_dispatch_details: e.target.value})} />
                      </div>
                    </TabsContent>
                  </Tabs>

                  <Button onClick={handleUpdateCast} className="w-full mt-4">
                    更新する
                  </Button>
                </DialogContent>
              </Dialog>
            )}

            <TabsContent value="management" className="space-y-6">
              {/* Search and Filter */}
              <Card className="mb-6">
              <CardContent className="p-4">
                <div className="flex gap-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input
                      placeholder="キャスト名で検索..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cast List */}
            <div className="space-y-1">
              {filteredCasts.map((cast) => (
                <div
                  key={cast.id}
                  draggable={isAdmin}
                  onDragStart={() => { dragCastId.current = cast.id; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropCast(cast.id)}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => handleEditCast(cast)}
                >
                  {isAdmin && (
                    <div
                      className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                      title="ドラッグして並び替え"
                    >
                      <GripVertical size={16} />
                    </div>
                  )}
                  {/* Photo */}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                    {cast.photo ? (
                      <img src={cast.photo} alt={cast.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera size={16} className="text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{cast.name}</span>
                      {!cast.is_visible && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          <EyeOff size={10} className="mr-0.5" />非表示
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {cast.access_token ? (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="ポータルURLをコピー" onClick={(e) => { e.stopPropagation(); copyPortalLink(cast.access_token!); }}>
                            <Copy size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="シフト提出URLをコピー" onClick={(e) => { e.stopPropagation(); copyShiftLink(cast.access_token!); }}>
                            <CalendarPlus size={14} />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="アクセストークン発行" onClick={(e) => { e.stopPropagation(); generateAccessToken(cast.id); }}>
                          <LinkIcon size={14} />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); handleEditCast(cast); }}>
                        <Edit size={14} />
                      </Button>
                      {deleteConfirmId === cast.id ? (
                        <>
                          <Button variant="destructive" size="sm" className="h-7 text-xs px-2" onClick={(e) => { e.stopPropagation(); handleDeleteCast(cast.id); }}>確認</Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}>×</Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-destructive hover:text-destructive-foreground" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(cast.id); }}>
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {filteredCasts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {casts.length === 0 
                  ? "キャストが登録されていません" 
                  : "検索条件に一致するキャストが見つかりません"}
              </div>
            )}
            </TabsContent>

          </Tabs>
          </div>
        </main>
      </div>
      <ImportModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        type="casts"
        onSuccess={fetchCasts}
      />
    </div>
  );
}
