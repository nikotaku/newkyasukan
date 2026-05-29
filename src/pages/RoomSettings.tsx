import { useState, useEffect, useRef } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Upload, X, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Room {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  capacity: number;
  amenities: string[] | null;
  is_active: boolean;
  address: string | null;
  access: string | null;
  map_address: string | null;
  map_url: string | null;
  sms_text: string | null;
  email_text: string | null;
  cast_guide: string | null;
  internal_notes: string | null;
  equipment_costumes: string | null;
  garbage_disposal: string | null;
  equipment_placement: string | null;
  room_photos: string[] | null;
  reset_procedure: string | null;
  cleaning_manual: string | null;
  entry_flow: string | null;
  key_info: string | null;
  key_number: string | null;
  entry_photos: string[] | null;
}

const RoomSettings = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<{
    name: string;
    display_name: string;
    description: string;
    capacity: number;
    amenities: string;
    is_active: boolean;
    address: string;
    access: string;
    map_address: string;
    map_url: string;
    sms_text: string;
    email_text: string;
    cast_guide: string;
    internal_notes: string;
    equipment_costumes: string;
    garbage_disposal: string;
    equipment_placement: string;
    room_photos: string[];
    entry_photos: string[];
  }>({
    name: "",
    display_name: "",
    description: "",
    capacity: 1,
    amenities: "",
    is_active: true,
    address: "",
    access: "",
    map_address: "",
    map_url: "",
    sms_text: "",
    email_text: "",
    cast_guide: "",
    internal_notes: "",
    equipment_costumes: "",
    garbage_disposal: "",
    equipment_placement: "",
    room_photos: [],
    entry_photos: [],
  });
  const [manualRoom, setManualRoom] = useState<Room | null>(null);
  const [manualDraft, setManualDraft] = useState({ reset_procedure: "", cleaning_manual: "" });
  const [savingManual, setSavingManual] = useState(false);
  const [entryRoom, setEntryRoom] = useState<Room | null>(null);
  const [entryDraft, setEntryDraft] = useState({ entry_flow: "", key_info: "", key_number: "", entry_photos: [] as string[] });
  const [savingEntry, setSavingEntry] = useState(false);
  const [uploadingEntryPhotos, setUploadingEntryPhotos] = useState(false);
  const entryPhotoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .order("name");

    if (error) {
      toast({
        title: "エラー",
        description: "ルーム情報の取得に失敗しました",
        variant: "destructive",
      });
      return;
    }

    setRooms(data || []);
  };

  const handleManualRoomSelect = (room: Room) => {
    setManualRoom(room);
    setManualDraft({
      reset_procedure: room.reset_procedure || "",
      cleaning_manual: room.cleaning_manual || "",
    });
  };

  const handleSaveManual = async () => {
    if (!manualRoom) return;
    setSavingManual(true);
    try {
      const { error } = await supabase
        .from("rooms")
        .update({
          reset_procedure: manualDraft.reset_procedure || null,
          cleaning_manual: manualDraft.cleaning_manual || null,
        })
        .eq("id", manualRoom.id);
      if (error) throw error;
      await fetchRooms();
      toast({ title: "保存しました", description: `${manualRoom.name}のマニュアルを保存しました` });
    } catch {
      toast({ title: "エラー", description: "保存に失敗しました", variant: "destructive" });
    } finally {
      setSavingManual(false);
    }
  };

  const handleOpenDialog = (room?: Room) => {
    if (room) {
      setEditingRoom(room);
      setFormData({
        name: room.name,
        display_name: room.display_name || "",
        description: room.description || "",
        capacity: room.capacity,
        amenities: room.amenities?.join(", ") || "",
        is_active: room.is_active,
        address: room.address || "",
        access: room.access || "",
        map_address: room.map_address || "",
        map_url: room.map_url || "",
        sms_text: room.sms_text || "",
        email_text: room.email_text || "",
        cast_guide: room.cast_guide || "",
        internal_notes: room.internal_notes || "",
        equipment_costumes: room.equipment_costumes || "",
        garbage_disposal: room.garbage_disposal || "",
        equipment_placement: room.equipment_placement || "",
        room_photos: room.room_photos || [],
        entry_photos: room.entry_photos || [],
      });
    } else {
      setEditingRoom(null);
      setFormData({
        name: "",
        display_name: "",
        description: "",
        capacity: 1,
        amenities: "",
        is_active: true,
        address: "",
        access: "",
        map_address: "",
        map_url: "",
        sms_text: "",
        email_text: "",
        cast_guide: "",
        internal_notes: "",
        equipment_costumes: "",
        garbage_disposal: "",
        equipment_placement: "",
        room_photos: [],
        entry_photos: [],
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "エラー",
        description: "ルーム名を入力してください",
        variant: "destructive",
      });
      return;
    }

    const amenitiesArray = formData.amenities
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a);

    const roomData = {
      name: formData.name,
      display_name: formData.display_name || null,
      description: formData.description || null,
      capacity: formData.capacity,
      amenities: amenitiesArray.length > 0 ? amenitiesArray : null,
      is_active: formData.is_active,
      address: formData.address || null,
      access: formData.access || null,
      map_address: formData.map_address || null,
      map_url: formData.map_url || null,
      sms_text: formData.sms_text || null,
      email_text: formData.email_text || null,
      cast_guide: formData.cast_guide || null,
      internal_notes: formData.internal_notes || null,
      equipment_costumes: formData.equipment_costumes || null,
      garbage_disposal: formData.garbage_disposal || null,
      equipment_placement: formData.equipment_placement || null,
      room_photos: formData.room_photos.length > 0 ? formData.room_photos : null,
      entry_photos: formData.entry_photos.length > 0 ? formData.entry_photos : null,
    };

    if (editingRoom) {
      const { error } = await supabase
        .from("rooms")
        .update(roomData)
        .eq("id", editingRoom.id);

      if (error) {
        toast({
          title: "エラー",
          description: "ルームの更新に失敗しました",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "成功",
        description: "ルームを更新しました",
      });
    } else {
      const { error } = await supabase.from("rooms").insert(roomData);

      if (error) {
        toast({
          title: "エラー",
          description: "ルームの追加に失敗しました",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "成功",
        description: "ルームを追加しました",
      });
    }

    setIsDialogOpen(false);
    fetchRooms();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("rooms").delete().eq("id", id);

    if (error) {
      toast({
        title: "エラー",
        description: "ルームの削除に失敗しました",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "成功",
      description: "ルームを削除しました",
    });

    fetchRooms();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('room-photos')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast({
            title: "エラー",
            description: `${file.name}のアップロードに失敗しました`,
            variant: "destructive",
          });
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('room-photos')
          .getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      if (uploadedUrls.length > 0) {
        setFormData(prev => ({
          ...prev,
          room_photos: [...prev.room_photos, ...uploadedUrls]
        }));
        toast({
          title: "成功",
          description: `${uploadedUrls.length}枚の写真をアップロードしました`,
        });
      }
    } catch (error) {
      console.error('Error uploading photos:', error);
      toast({
        title: "エラー",
        description: "写真のアップロードに失敗しました",
        variant: "destructive",
      });
    } finally {
      setUploadingPhotos(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      room_photos: prev.room_photos.filter((_, i) => i !== index)
    }));
  };

  const handleEntryRoomSelect = (room: Room) => {
    setEntryRoom(room);
    setEntryDraft({
      entry_flow: room.entry_flow || "",
      key_info: room.key_info || "",
      key_number: room.key_number || "",
      entry_photos: room.entry_photos || [],
    });
  };

  const handleEntryPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingEntryPhotos(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('entry-photos')
          .upload(fileName, file);
        if (uploadError) {
          toast({ title: "エラー", description: `${file.name}のアップロードに失敗しました`, variant: "destructive" });
          continue;
        }
        const { data: { publicUrl } } = supabase.storage.from('entry-photos').getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }
      if (uploadedUrls.length > 0) {
        setEntryDraft(prev => ({ ...prev, entry_photos: [...prev.entry_photos, ...uploadedUrls] }));
        toast({ title: "成功", description: `${uploadedUrls.length}枚の写真をアップロードしました` });
      }
    } catch {
      toast({ title: "エラー", description: "写真のアップロードに失敗しました", variant: "destructive" });
    } finally {
      setUploadingEntryPhotos(false);
      if (entryPhotoInputRef.current) entryPhotoInputRef.current.value = '';
    }
  };

  const handleRemoveEntryPhoto = (index: number) => {
    setEntryDraft(prev => ({ ...prev, entry_photos: prev.entry_photos.filter((_, i) => i !== index) }));
  };

  const handleSaveEntry = async () => {
    if (!entryRoom) return;
    setSavingEntry(true);
    try {
      const { error } = await supabase.from("rooms").update({
        entry_flow: entryDraft.entry_flow || null,
        key_info: entryDraft.key_info || null,
        key_number: entryDraft.key_number || null,
        entry_photos: entryDraft.entry_photos.length > 0 ? entryDraft.entry_photos : null,
      }).eq("id", entryRoom.id);
      if (error) throw error;
      await fetchRooms();
      toast({ title: "保存しました", description: `${entryRoom.name}の入室方法を保存しました` });
    } catch {
      toast({ title: "エラー", description: "保存に失敗しました", variant: "destructive" });
    } finally {
      setSavingEntry(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[180px] transition-all duration-300">
        <div className="p-4">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="mb-4">
              <h1 className="text-2xl font-bold">ルーム設定</h1>
            </div>

            <Tabs defaultValue="rooms">
              <TabsList className="mb-6">
                <TabsTrigger value="rooms">ルーム一覧</TabsTrigger>
                <TabsTrigger value="reset">リセット手順</TabsTrigger>
                <TabsTrigger value="cleaning">清掃マニュアル</TabsTrigger>
                <TabsTrigger value="entry">入室方法</TabsTrigger>
              </TabsList>

              <TabsContent value="rooms">
                <div className="flex justify-end mb-4">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="w-4 h-4 mr-2" />
                    ルーム追加
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-md max-h-[85dvh] overflow-hidden p-0 gap-0">
                  <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
                    <DialogTitle>
                      {editingRoom ? "ルーム編集" : "ルーム追加"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="overflow-y-auto px-4 py-4">
                    <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">ルーム名 *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="例: インルーム"
                      />
                    </div>
                    <div>
                      <Label htmlFor="display_name">表示名</Label>
                      <Input
                        id="display_name"
                        value={formData.display_name}
                        onChange={(e) =>
                          setFormData({ ...formData, display_name: e.target.value })
                        }
                        placeholder="例: ■二日町インroom■"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">説明</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
                        }
                        placeholder="ルームの説明を入力"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="capacity">収容人数</Label>
                      <Input
                        id="capacity"
                        type="number"
                        min="1"
                        value={formData.capacity}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            capacity: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="amenities">
                        設備・備品（カンマ区切り）
                      </Label>
                      <Input
                        id="amenities"
                        value={formData.amenities}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            amenities: e.target.value,
                          })
                        }
                        placeholder="例: シャワー, タオル, ドライヤー"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address">住所</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) =>
                          setFormData({ ...formData, address: e.target.value })
                        }
                        placeholder="例: 仙台市青葉区二日町11-15 In-Towner 201号室"
                      />
                    </div>
                    <div>
                      <Label htmlFor="access">アクセス</Label>
                      <Input
                        id="access"
                        value={formData.access}
                        onChange={(e) =>
                          setFormData({ ...formData, access: e.target.value })
                        }
                        placeholder="例: ⚫地下鉄南北線/北四番丁駅 徒歩5分"
                      />
                    </div>
                    <div>
                      <Label htmlFor="map_address">Map住所</Label>
                      <Input
                        id="map_address"
                        value={formData.map_address}
                        onChange={(e) =>
                          setFormData({ ...formData, map_address: e.target.value })
                        }
                        placeholder="例: 仙台市青葉区二日町11"
                      />
                    </div>
                    <div>
                      <Label htmlFor="map_url">GoogleマップURL</Label>
                      <Input
                        id="map_url"
                        value={formData.map_url}
                        onChange={(e) =>
                          setFormData({ ...formData, map_url: e.target.value })
                        }
                        placeholder="https://x.gd/..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="sms_text">SMSテキスト</Label>
                      <Textarea
                        id="sms_text"
                        value={formData.sms_text}
                        onChange={(e) =>
                          setFormData({ ...formData, sms_text: e.target.value })
                        }
                        placeholder="SMS送信用の住所案内文"
                        rows={5}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email_text">メールテキスト</Label>
                      <Textarea
                        id="email_text"
                        value={formData.email_text}
                        onChange={(e) =>
                          setFormData({ ...formData, email_text: e.target.value })
                        }
                        placeholder="メール送信用の住所案内文"
                        rows={5}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cast_guide">キャスト用案内</Label>
                      <Textarea
                        id="cast_guide"
                        value={formData.cast_guide}
                        onChange={(e) =>
                          setFormData({ ...formData, cast_guide: e.target.value })
                        }
                        placeholder="セラピスト向けの入室案内"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="internal_notes">内部メモ</Label>
                      <Textarea
                        id="internal_notes"
                        value={formData.internal_notes}
                        onChange={(e) =>
                          setFormData({ ...formData, internal_notes: e.target.value })
                        }
                        placeholder="スタッフ用メモ"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="equipment_costumes">
                        ルーム設備/衣装
                      </Label>
                      <Textarea
                        id="equipment_costumes"
                        value={formData.equipment_costumes}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            equipment_costumes: e.target.value,
                          })
                        }
                        placeholder="設備や衣装の詳細を入力"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="garbage_disposal">
                        ゴミ出しの方法
                      </Label>
                      <Textarea
                        id="garbage_disposal"
                        value={formData.garbage_disposal}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            garbage_disposal: e.target.value,
                          })
                        }
                        placeholder="ゴミ出しの方法を入力"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="equipment_placement">
                        備品の配置
                      </Label>
                      <Textarea
                        id="equipment_placement"
                        value={formData.equipment_placement}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            equipment_placement: e.target.value,
                          })
                        }
                        placeholder="備品の配置を入力"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>ルーム写真</Label>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handlePhotoUpload}
                            className="hidden"
                            id="photo-upload"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingPhotos}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {uploadingPhotos ? 'アップロード中...' : '写真を選択'}
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            複数の写真を選択できます
                          </span>
                        </div>

                        {formData.room_photos && formData.room_photos.length > 0 && (
                          <div className="grid grid-cols-3 gap-4">
                            {formData.room_photos.map((photo, index) => (
                              <div key={index} className="relative group">
                                <img
                                  src={photo}
                                  alt={`Room photo ${index + 1}`}
                                  className="w-full h-32 object-cover rounded-lg"
                                />
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                                  onClick={() => handleRemovePhoto(index)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="is_active"
                        checked={formData.is_active}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, is_active: checked })
                        }
                      />
                      <Label htmlFor="is_active">有効</Label>
                    </div>
                      <div className="flex gap-2 pb-1">
                        <Button
                          onClick={handleSave}
                          className="flex-1"
                        >
                          保存
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setIsDialogOpen(false)}
                          className="flex-1"
                        >
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room) => (
                <Card key={room.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{room.name}</span>
                      <div className="flex items-center gap-2">
                        {room.is_active ? (
                          <span className="text-xs px-2 py-1 bg-green-500/20 text-green-600 rounded">
                            有効
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 bg-gray-500/20 text-gray-600 rounded">
                            無効
                          </span>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {room.display_name && (
                      <p className="text-xs text-muted-foreground">{room.display_name}</p>
                    )}
                    {room.address && (
                      <p className="text-sm">{room.address}</p>
                    )}
                    {room.access && (
                      <p className="text-sm text-muted-foreground">{room.access}</p>
                    )}
                    {room.map_url && (
                      <a href={room.map_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                        Googleマップ →
                      </a>
                    )}
                    {room.description && (
                      <p className="text-sm text-muted-foreground">{room.description}</p>
                    )}
                    {room.room_photos && room.room_photos.length > 0 && (
                      <img src={room.room_photos[0]} alt={room.name} className="w-full h-32 object-cover rounded" />
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog(room)}
                        className="flex-1"
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        編集
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="w-4 h-4 mr-1" />
                            削除
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              本当に削除しますか？
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              この操作は取り消せません。ルーム「{room.name}
                              」を削除してもよろしいですか？
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(room.id)}
                            >
                              削除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
              </TabsContent>

              {/* ─── リセット手順 ─── */}
              <TabsContent value="reset">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground mb-3">ルームを選択</p>
                    {rooms.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleManualRoomSelect(r)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          manualRoom?.id === r.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                  <div className="md:col-span-3">
                    {manualRoom ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">{manualRoom.name} — リセット手順</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <p className="text-xs text-muted-foreground">
                            セラピストがセッション終了後にルームをリセットする手順を記入してください。マークダウン記法が使えます（# 見出し、- リスト など）。
                          </p>
                          <Textarea
                            value={manualDraft.reset_procedure}
                            onChange={(e) =>
                              setManualDraft({ ...manualDraft, reset_procedure: e.target.value })
                            }
                            placeholder={`# リセット手順\n\n## 退室前チェック\n- ベッドシーツを交換する\n- ゴミを捨てる\n- ...\n\n## 備品の確認\n- タオルの枚数確認\n- ...`}
                            rows={20}
                            className="font-mono text-sm"
                          />
                          <Button onClick={handleSaveManual} disabled={savingManual} className="w-full">
                            <Save size={15} className="mr-2" />
                            {savingManual ? "保存中..." : "保存する"}
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card>
                        <CardContent className="py-16 text-center text-muted-foreground">
                          左のリストからルームを選んでください
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ─── 清掃マニュアル ─── */}
              <TabsContent value="cleaning">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground mb-3">ルームを選択</p>
                    {rooms.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleManualRoomSelect(r)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          manualRoom?.id === r.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                  <div className="md:col-span-3">
                    {manualRoom ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">{manualRoom.name} — 清掃マニュアル</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <p className="text-xs text-muted-foreground">
                            定期清掃・消毒の手順を記入してください。マークダウン記法が使えます。
                          </p>
                          <Textarea
                            value={manualDraft.cleaning_manual}
                            onChange={(e) =>
                              setManualDraft({ ...manualDraft, cleaning_manual: e.target.value })
                            }
                            placeholder={`# 清掃マニュアル\n\n## 毎回（セッション終了後）\n- ベッド消毒\n- ...\n\n## 週次\n- 床の拭き掃除\n- ...\n\n## 月次\n- エアコンフィルター清掃\n- ...`}
                            rows={20}
                            className="font-mono text-sm"
                          />
                          <Button onClick={handleSaveManual} disabled={savingManual} className="w-full">
                            <Save size={15} className="mr-2" />
                            {savingManual ? "保存中..." : "保存する"}
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card>
                        <CardContent className="py-16 text-center text-muted-foreground">
                          左のリストからルームを選んでください
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ─── 入室方法 ─── */}
              <TabsContent value="entry">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground mb-3">ルームを選択</p>
                    {rooms.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleEntryRoomSelect(r)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          entryRoom?.id === r.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                  <div className="md:col-span-3">
                    {entryRoom ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">{entryRoom.name} — 入室方法</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <Label htmlFor="entry_key_number">暗証番号</Label>
                            <Input
                              id="entry_key_number"
                              value={entryDraft.key_number}
                              onChange={(e) => setEntryDraft({ ...entryDraft, key_number: e.target.value })}
                              placeholder="例: 1234"
                              className="font-mono"
                            />
                          </div>
                          <div>
                            <Label htmlFor="entry_flow">入室手順</Label>
                            <Textarea
                              id="entry_flow"
                              value={entryDraft.entry_flow}
                              onChange={(e) => setEntryDraft({ ...entryDraft, entry_flow: e.target.value })}
                              placeholder={`例:\n1. 建物の正面入口から入る\n2. エレベーターで3階へ\n3. 302号室のドアを暗証番号で開ける`}
                              rows={8}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor="entry_key_info">鍵の場所・補足</Label>
                            <Textarea
                              id="entry_key_info"
                              value={entryDraft.key_info}
                              onChange={(e) => setEntryDraft({ ...entryDraft, key_info: e.target.value })}
                              placeholder="例: 鍵はドア横のキーボックス内。暗証番号は上記と同じ。"
                              rows={4}
                              className="text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>入室方法の写真</Label>
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <input
                                  ref={entryPhotoInputRef}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={handleEntryPhotoUpload}
                                  className="hidden"
                                  id="entry-photo-upload"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => entryPhotoInputRef.current?.click()}
                                  disabled={uploadingEntryPhotos}
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  {uploadingEntryPhotos ? 'アップロード中...' : '写真を選択'}
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                  複数の写真を選択できます
                                </span>
                              </div>
                              {entryDraft.entry_photos.length > 0 && (
                                <div className="grid grid-cols-3 gap-4">
                                  {entryDraft.entry_photos.map((photo, index) => (
                                    <div key={index} className="relative group">
                                      <img
                                        src={photo}
                                        alt={`入室方法写真 ${index + 1}`}
                                        className="w-full h-32 object-cover rounded-lg"
                                      />
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="icon"
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                                        onClick={() => handleRemoveEntryPhoto(index)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <Button onClick={handleSaveEntry} disabled={savingEntry} className="w-full">
                            <Save size={15} className="mr-2" />
                            {savingEntry ? "保存中..." : "保存する"}
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card>
                        <CardContent className="py-16 text-center text-muted-foreground">
                          左のリストからルームを選んでください
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

            </Tabs>
          </div>
        </div>

        <footer className="mt-auto py-4 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs text-muted-foreground">
              © 2025 caskan.jp All rights reserved
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default RoomSettings;