import { useState, useEffect, useRef } from "react";
import { Plus, Edit, Trash2, Search, Filter, Camera, Clock, TrendingUp, Sparkles, Link as LinkIcon, Copy, Eye, EyeOff, CalendarPlus, GripVertical, FileUp, X } from "lucide-react";
import { driveImgUrl } from "@/lib/drive";
import { ImportModal } from "@/components/ImportModal";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { WebsitePhotoSync } from "@/components/WebsitePhotoSync";
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

interface Cast {
  id: string;
  name: string;
  type: string;
  status: string;
  photo: string | null;
  photos: string[] | null;
  photo_captions?: string[] | null;
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
  favorite_techniques: string | null;
  favorite_food: string | null;
  ideal_partner: string | null;
  follow_list: string | null;
  media_registration: string[] | null;
  marks: string[] | null;
  files: string[] | null;
  registration_sheet: string | null;
  format_type: string | null;
  recent_dispatch_details: string | null;
  memo: string | null;
  dispatch_status: string | null;
  repeat_scheduled: boolean | null;
  is_visible: boolean;
  display_order?: number;
  height?: number | null;
  cup_size?: string | null;
  bust?: number | null;
  waist?: number | null;
  hip?: number | null;
  target_customers?: string | null;
  customer_age_range?: string | null;
  mbti?: string | null;
  account_info?: string | null;
  custom_properties?: any;
}

type CustomProp = { id: string; label: string; type: "text" | "number" | "url"; value: string };

export default function Staff() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCast, setEditingCast] = useState<Cast | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingContent, setGeneratingContent] = useState(false);
  
  // フォーム用の状態
  const [formData, setFormData] = useState({
    name: "",
    type: "インルーム",
    room: "インルーム",
    status: "未着手",
    profile: "",
    photo: "",
    photos: [] as string[],
    photo_captions: [] as string[],
    therapist_years: 0,
    favorite_techniques: "",
    favorite_food: "",
    ideal_partner: "",
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
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const dragCastId = useRef<string | null>(null);
  
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

  const filteredCasts = casts.filter(cast => {
    const matchesSearch = cast.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || cast.type === filterType;
    const matchesStatus = filterStatus === "all" || cast.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

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
      const { error } = await supabase
        .from('casts')
        .insert([{
          name: formData.name,
          type: formData.type,
          room: formData.room,
          status: formData.status,
          profile: formData.profile,
          photo: formData.photos[0] || formData.photo || null,
          photos: formData.photos.length > 0 ? formData.photos : null,
          photo_captions: formData.photo_captions.length > 0 ? formData.photo_captions : null,
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
        }]);

      if (error) throw error;

      toast({
        title: "キャスト追加",
        description: "新しいキャストが追加されました",
      });
      
      setIsAddDialogOpen(false);
      setFormData({
        name: "",
        type: "インルーム",
        room: "インルーム",
        status: "未着手",
        profile: "",
        photo: "",
        photos: [],
        photo_captions: [],
        therapist_years: 0,
        favorite_techniques: "",
        favorite_food: "",
        ideal_partner: "",
        follow_list: "",
        media_registration: [],
        marks: [],
        files: [],
        registration_sheet: "",
        format_type: "",
        recent_dispatch_details: "",
        memo: "",
        dispatch_status: "none",
        repeat_scheduled: false,
      });
    } catch (error) {
      console.error('Error adding cast:', error);
      toast({
        title: "エラー",
        description: "キャストの追加に失敗しました",
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
      console.log('Updating cast with photos:', photos);
      const { error } = await supabase
        .from('casts')
        .update({
          name: editingCast.name,
          type: editingCast.type,
          room: editingCast.room,
          status: editingCast.status,
          profile: editingCast.profile,
          photo: photos.length > 0 ? photos[0] : null,
          photos: photos.length > 0 ? photos : null,
          photo_captions: (editingCast.photo_captions && editingCast.photo_captions.length > 0) ? editingCast.photo_captions : null,
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
          is_online: (editingCast as any).is_online ?? false,
          height: editingCast.height ?? null,
          cup_size: editingCast.cup_size ?? null,
          bust: editingCast.bust ?? null,
          waist: editingCast.waist ?? null,
          hip: editingCast.hip ?? null,
          target_customers: editingCast.target_customers ?? null,
          customer_age_range: editingCast.customer_age_range ?? null,
          mbti: editingCast.mbti ?? null,
          account_info: editingCast.account_info ?? null,
          custom_properties: editingCast.custom_properties ?? [],
        } as any)
        .eq('id', editingCast.id);

      if (error) throw error;

      toast({
        title: "キャスト更新",
        description: "キャスト情報が更新されました",
      });
      
      setIsEditDialogOpen(false);
      setEditingCast(null);
    } catch (error: any) {
      console.error('Error updating cast:', error);
      const msg = error?.message || error?.details || "キャストの更新に失敗しました";
      toast({
        title: "エラー",
        description: msg,
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

  const handleOnlineToggle = async (id: string, currentOnline: boolean) => {
    if (!isAdmin) {
      toast({
        title: "権限エラー",
        description: "管理者のみ変更できます",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('casts')
        .update({ is_online: !currentOnline } as any)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "ステータス変更",
        description: !currentOnline ? "オンラインにしました" : "オフラインにしました",
      });
    } catch (error) {
      console.error('Error updating online status:', error);
      toast({
        title: "エラー",
        description: "ステータスの変更に失敗しました",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "派遣中": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "リピート予定": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "残タスク": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "未着手": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
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
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>新しいキャストを追加</DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="basic" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="basic">基本情報</TabsTrigger>
                        <TabsTrigger value="details">詳細情報</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="basic" className="space-y-4 mt-4">
                        <div>
                          <Label htmlFor="name">セラピスト名</Label>
                          <Input 
                            id="name" 
                            placeholder="名前を入力"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="status">ステータス</Label>
                          <Select 
                            value={formData.status}
                            onValueChange={(value) => setFormData({...formData, status: value})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="ステータスを選択" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="派遣中">派遣中</SelectItem>
                              <SelectItem value="リピート予定">リピート予定</SelectItem>
                              <SelectItem value="残タスク">残タスク</SelectItem>
                              <SelectItem value="未着手">未着手</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label htmlFor="profile">プロフィール</Label>
                          <Textarea 
                            id="profile" 
                            rows={3} 
                            placeholder="キャストの魅力や特徴を入力..."
                            value={formData.profile}
                            onChange={(e) => setFormData({...formData, profile: e.target.value})}
                          />
                        </div>
                        
                        <div>
                          <Label>写真（GoogleドライブURL）</Label>
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input
                                placeholder="https://drive.google.com/file/d/... またはファイルID"
                                value={newPhotoUrl}
                                onChange={(e) => setNewPhotoUrl(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhotoUrl(newPhotoUrl, false))}
                              />
                              <Button type="button" variant="outline" onClick={() => addPhotoUrl(newPhotoUrl, false)} disabled={!newPhotoUrl.trim()}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            {formData.photos.length > 0 && (
                              <div className="grid grid-cols-2 gap-2">
                                {formData.photos.map((photo, index) => (
                                  <div key={index} className="relative group">
                                    <img
                                      src={driveImgUrl(photo)}
                                      alt={`プレビュー ${index + 1}`}
                                      className="w-full h-[200px] object-cover rounded-md"
                                    />
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => handleRemovePhoto(index, false)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                    <Badge variant="secondary" className="absolute bottom-1 left-1">{index + 1}</Badge>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="details" className="space-y-4 mt-4">
                        <div>
                          <Label htmlFor="dispatch-status">派遣ステータス</Label>
                          <Select 
                            value={formData.dispatch_status}
                            onValueChange={(value) => setFormData({...formData, dispatch_status: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">未設定</SelectItem>
                              <SelectItem value="scheduled">派遣予定</SelectItem>
                              <SelectItem value="dispatched">派遣中</SelectItem>
                              <SelectItem value="completed">完了</SelectItem>
                              <SelectItem value="cancelled">キャンセル</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="repeat-scheduled"
                            checked={formData.repeat_scheduled}
                            onChange={(e) => setFormData({...formData, repeat_scheduled: e.target.checked})}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="repeat-scheduled">リピート予定</Label>
                        </div>


                        <div>
                          <Label htmlFor="memo">メモ欄</Label>
                          <Textarea 
                            id="memo" 
                            rows={4}
                            placeholder="メモを入力..."
                            value={formData.memo}
                            onChange={(e) => setFormData({...formData, memo: e.target.value})}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                    
                    <Button onClick={handleAddCast} className="w-full mt-4">
                      追加
                    </Button>
                  </DialogContent>
                </Dialog>
              )}
              </div>
            </div>

            {/* Edit Dialog */}
            {editingCast && (
              <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>キャスト編集</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                      <div>
                        <Label htmlFor="edit-name">セラピスト名</Label>
                        <Input
                          id="edit-name"
                          placeholder="名前を入力"
                          value={editingCast.name}
                          onChange={(e) => setEditingCast({...editingCast, name: e.target.value})}
                        />
                      </div>

                      
                      <div className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${(editingCast as any).is_online ? "bg-green-500" : "bg-gray-400"}`} />
                          <Label>オンライン表示（HP）</Label>
                        </div>
                        <Button
                          type="button"
                          variant={(editingCast as any).is_online ? "default" : "outline"}
                          size="sm"
                          className={(editingCast as any).is_online ? "bg-green-500 hover:bg-green-600" : ""}
                          onClick={() => setEditingCast({...editingCast, is_online: !(editingCast as any).is_online} as any)}
                        >
                          {(editingCast as any).is_online ? "オンライン" : "オフライン"}
                        </Button>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label htmlFor="edit-profile">プロフィール</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleGenerateContent('profile')}
                            disabled={generatingContent}
                          >
                            <Sparkles className="w-4 h-4 mr-1" />
                            AI生成
                          </Button>
                        </div>
                        <Textarea 
                          id="edit-profile" 
                          rows={5}
                          placeholder="キャストの魅力や特徴を入力..."
                          value={editingCast.profile || ""}
                          onChange={(e) => setEditingCast({...editingCast, profile: e.target.value})}
                        />
                      </div>
                      
                      <div>
                        <Label>写真（GoogleドライブURL）</Label>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              placeholder="https://drive.google.com/file/d/... またはファイルID"
                              value={newPhotoUrl}
                              onChange={(e) => setNewPhotoUrl(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhotoUrl(newPhotoUrl, true))}
                            />
                            <Button type="button" variant="outline" onClick={() => addPhotoUrl(newPhotoUrl, true)} disabled={!newPhotoUrl.trim()}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          {(editingCast.photos || []).length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                              {(editingCast.photos || []).map((photo, index) => (
                                <div key={index} className="relative group">
                                  <img
                                    src={driveImgUrl(photo)}
                                    alt={`プレビュー ${index + 1}`}
                                    className="w-full h-[200px] object-cover rounded-md"
                                  />
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleRemovePhoto(index, true)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                  <Badge variant="secondary" className="absolute bottom-1 left-1">{index + 1}</Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="edit-x-account">Xアカウント</Label>
                        <Input 
                          id="edit-x-account" 
                          placeholder="@username"
                          value={editingCast.x_account || ""}
                          onChange={(e) => setEditingCast({...editingCast, x_account: e.target.value})}
                        />
                      </div>

                      {/* カスタムプロパティ（テキスト / リンク / 画像） */}
                      <div className="border-t pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold text-muted-foreground">カスタムプロパティ</Label>
                          <div className="flex gap-1">
                            <Button type="button" variant="outline" size="sm" onClick={() => {
                              const list = Array.isArray(editingCast.custom_properties) ? editingCast.custom_properties : [];
                              setEditingCast({ ...editingCast, custom_properties: [...list, { id: crypto.randomUUID(), label: "", type: "text", value: "" }] });
                            }}>+ テキスト</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => {
                              const list = Array.isArray(editingCast.custom_properties) ? editingCast.custom_properties : [];
                              setEditingCast({ ...editingCast, custom_properties: [...list, { id: crypto.randomUUID(), label: "", type: "link", value: "" }] });
                            }}>+ リンク</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => {
                              const list = Array.isArray(editingCast.custom_properties) ? editingCast.custom_properties : [];
                              setEditingCast({ ...editingCast, custom_properties: [...list, { id: crypto.randomUUID(), label: "", type: "image", value: "" }] });
                            }}>+ 画像</Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {(Array.isArray(editingCast.custom_properties) ? editingCast.custom_properties : []).map((cp: any, idx: number) => {
                            const updateCp = (patch: any) => {
                              const list = [...editingCast.custom_properties];
                              list[idx] = { ...list[idx], ...patch };
                              setEditingCast({ ...editingCast, custom_properties: list });
                            };
                            const removeCp = () => {
                              const list = editingCast.custom_properties.filter((_: any, i: number) => i !== idx);
                              setEditingCast({ ...editingCast, custom_properties: list });
                            };
                            return (
                              <div key={cp.id || idx} className="flex gap-2 items-start p-2 border rounded">
                                <div className="flex-1 space-y-2">
                                  <div className="flex gap-2 items-center">
                                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                                      {cp.type === "image" ? "画像" : cp.type === "link" ? "リンク" : "テキスト"}
                                    </span>
                                    <Input placeholder="項目名" value={cp.label || ""} onChange={(e) => updateCp({ label: e.target.value })} />
                                  </div>
                                  {cp.type === "image" ? (
                                    <div className="space-y-1">
                                      {cp.value && <img src={cp.value} alt="" className="w-24 h-24 object-cover rounded border" />}
                                      <Input type="file" accept="image/*" onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const ext = file.name.split(".").pop() || "jpg";
                                        const path = `custom/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
                                        const { error } = await supabase.storage.from("cast-photos").upload(path, file);
                                        if (error) { toast({ variant: "destructive", title: "アップロード失敗", description: error.message }); return; }
                                        const { data: { publicUrl } } = supabase.storage.from("cast-photos").getPublicUrl(path);
                                        updateCp({ value: publicUrl });
                                      }} />
                                    </div>
                                  ) : (
                                    <Input
                                      type={cp.type === "link" ? "url" : "text"}
                                      placeholder={cp.type === "link" ? "https://..." : "値"}
                                      value={cp.value || ""}
                                      onChange={(e) => updateCp({ value: e.target.value })}
                                    />
                                  )}
                                </div>
                                <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={removeCp}>
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            );
                          })}
                          {(!editingCast.custom_properties || editingCast.custom_properties.length === 0) && (
                            <p className="text-xs text-muted-foreground text-center py-2">上の「+」ボタンで項目を追加できます</p>
                          )}
                        </div>
                      </div>

                  </div>
                  
                  <Button onClick={handleUpdateCast} className="w-full mt-4">
                    更新
                  </Button>
                </DialogContent>
              </Dialog>
            )}

            {/* Website Photo Sync */}
            {isAdmin && (
              <div className="mb-6">
                <WebsitePhotoSync />
              </div>
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
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全タイプ</SelectItem>
                      <SelectItem value="インルーム">インルーム</SelectItem>
                      <SelectItem value="ラスルーム">ラスルーム</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全ステータス</SelectItem>
                      <SelectItem value="派遣中">派遣中</SelectItem>
                      <SelectItem value="リピート予定">リピート予定</SelectItem>
                      <SelectItem value="残タスク">残タスク</SelectItem>
                      <SelectItem value="未着手">未着手</SelectItem>
                    </SelectContent>
                  </Select>
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

                  {/* Name & Room */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{cast.name}</span>
                      {!cast.is_visible && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          <EyeOff size={10} className="mr-0.5" />非表示
                        </Badge>
                      )}
                    </div>
                    {cast.room && <p className="text-xs text-muted-foreground truncate">{cast.room}</p>}
                  </div>

                  {/* Online toggle - hidden on mobile */}
                  {isAdmin && (
                    <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant={(cast as any).is_online ? "default" : "outline"}
                        size="sm"
                        className={`text-[11px] h-7 px-3 ${(cast as any).is_online ? "bg-green-500 hover:bg-green-600 border-green-500" : "text-muted-foreground"}`}
                        onClick={(e) => { e.stopPropagation(); handleOnlineToggle(cast.id, (cast as any).is_online); }}
                      >
                        {(cast as any).is_online ? "オンライン" : "オフライン"}
                      </Button>
                    </div>
                  )}

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
