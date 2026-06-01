import { useState, useEffect } from "react";
import { toExtTime } from "@/lib/timeFormat";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ReservationForm } from "@/components/ReservationForm";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { postToSheet } from "@/lib/sheetWebhook";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Search, FileUp, Table2, Plus, Pencil } from "lucide-react";
import { ImportModal } from "@/components/ImportModal";
import { GoogleSheetPanel } from "@/components/GoogleSheetPanel";
import { mapReservationRows, batchInsert } from "@/lib/importMappers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Reservation {
  id: string;
  cast_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  reservation_date: string;
  start_time: string;
  duration: number;
  course_type: string | null;
  course_name: string;
  options: string[] | null;
  nomination_type: string | null;
  price: number;
  discount: number | null;
  discount_ids: string[] | null;
  payment_method: string | null;
  payment_fee: number | null;
  reservation_method: string | null;
  notes: string | null;
  room: string | null;
  status: string;
  casts: { name: string } | null;
}

interface Cast { id: string; name: string; }
interface Room { id: string; name: string; address: string | null; }
interface BackRate { id: string; course_type: string; duration: number; customer_price: number; therapist_back: number; }
interface OptionRate { id: string; option_name: string; customer_price: number; therapist_back: number; }
interface NominationRate { id: string; nomination_type: string; customer_price: number; therapist_back: number | null; }
interface Discount { id: string; name: string; discount_type: "fixed" | "percentage"; discount_value: number; is_active: boolean; }

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  sms_waiting: "bg-purple-100 text-purple-900",
  confirmed: "bg-blue-100 text-blue-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "確認中",
  sms_waiting: "SMS送信待ち",
  confirmed: "確定",
  completed: "完了",
  cancelled: "キャンセル",
};

export default function ReservationsList() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [backRates, setBackRates] = useState<BackRate[]>([]);
  const [optionRates, setOptionRates] = useState<OptionRate[]>([]);
  const [nominationRates, setNominationRates] = useState<NominationRate[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [editFormData, setEditFormData] = useState({
    cast_id: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    nomination_type: "none",
    reservation_date: new Date(),
    start_time: "14:00",
    end_time: "15:00",
    duration: 80,
    room: "",
    course_type: "アロマオイル",
    course_name: "アロマオイル 80分",
    selectedOptions: [] as string[],
    discount_ids: [] as string[],
    discount: 0,
    price: 12000,
    payment_method: "cash",
    payment_fee: 0,
    reservation_method: "",
    notes: "",
  });
  const [formData, setFormData] = useState({
    cast_id: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    nomination_type: "none",
    reservation_date: new Date(),
    start_time: "14:00",
    end_time: "15:00",
    duration: 80,
    room: "",
    course_type: "アロマオイル",
    course_name: "アロマオイル 80分",
    selectedOptions: [] as string[],
    discount_ids: [] as string[],
    discount: 0,
    price: 12000,
    payment_method: "cash",
    payment_fee: 0,
    reservation_method: "",
    notes: "",
  });

  const { user, loading: authLoading, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchReservations();
      fetchCasts();
      fetchRooms();
      fetchRates();
    }
  }, [user]);

  const fetchCasts = async () => {
    const { data } = await supabase.from("casts").select("id, name").order("name");
    setCasts(data || []);
  };

  const fetchRooms = async () => {
    const { data } = await supabase.from("rooms").select("id, name, address").eq("is_active", true).order("name");
    setRooms(data || []);
  };

  const fetchRates = async () => {
    const [{ data: backData }, { data: optionData }, { data: nominationData }, { data: discountData }] = await Promise.all([
      supabase.from("back_rates").select("*").order("display_order"),
      supabase.from("option_rates").select("*").order("display_order"),
      supabase.from("nomination_rates").select("*"),
      supabase.from("discounts").select("id, name, discount_type, discount_value, is_active").eq("is_active", true).order("name"),
    ]);
    if (backData) setBackRates(backData);
    if (optionData) setOptionRates(optionData);
    if (nominationData) setNominationRates(nominationData);
    if (discountData) setDiscounts(discountData as Discount[]);
  };

  const handleAddReservation = async () => {
    if (!isAdmin) {
      toast({ title: "権限エラー", description: "管理者のみ予約を追加できます", variant: "destructive" });
      return;
    }
    if (!formData.cast_id || !formData.customer_name || !formData.customer_phone) {
      toast({ title: "入力エラー", description: "必須項目を入力してください", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase.from("reservations").insert([{
        cast_id: formData.cast_id,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        customer_email: formData.customer_email || null,
        reservation_date: format(formData.reservation_date, "yyyy-MM-dd"),
        start_time: formData.start_time,
        duration: formData.duration,
        course_type: formData.course_type,
        course_name: formData.course_name,
        options: formData.selectedOptions,
        nomination_type: formData.nomination_type === "none" ? null : formData.nomination_type,
        price: formData.price,
        discount: formData.discount,
        payment_method: formData.payment_method || null,
        payment_fee: formData.payment_fee || 0,
        notes: formData.notes || null,
        room: formData.room || null,
        created_by: user!.id,
      }]);
      if (error) throw error;
      postToSheet("reservation", {
        reservation_date: format(formData.reservation_date, "yyyy-MM-dd"),
        start_time: formData.start_time,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        customer_email: formData.customer_email || "",
        cast_name: casts.find((c) => c.id === formData.cast_id)?.name || "",
        course_name: formData.course_name,
        nomination_type: formData.nomination_type === "none" ? "" : formData.nomination_type,
        room: formData.room || "",
        discount: formData.discount,
        price: formData.price,
        created_at: new Date().toISOString(),
      });
      toast({ title: "予約追加", description: "新しい予約が追加されました" });
      setIsAddDialogOpen(false);
      setFormData({
        cast_id: "", customer_name: "", customer_phone: "", customer_email: "",
        nomination_type: "none", reservation_date: new Date(), start_time: "14:00", end_time: "15:00",
        duration: 80, room: "", course_type: "アロマオイル", course_name: "アロマオイル 80分",
        selectedOptions: [], discount_ids: [] as string[], discount: 0, price: 12000,
        payment_method: "cash", reservation_method: "", notes: "",
      });
      fetchReservations();
    } catch (error) {
      console.error("Error adding reservation:", error);
      toast({ title: "エラー", description: "予約の追加に失敗しました", variant: "destructive" });
    }
  };

  const openEditSheet = (res: Reservation) => {
    setEditingReservation(res);
    const [h, m] = res.start_time.slice(0, 5).split(":").map(Number);
    const endMin = (h < 6 ? h + 24 : h) * 60 + m + res.duration;
    const eh = Math.floor(endMin / 60) % 24;
    const em = endMin % 60;
    setEditFormData({
      cast_id: res.cast_id || "",
      customer_name: res.customer_name,
      customer_phone: res.customer_phone,
      customer_email: res.customer_email || "",
      nomination_type: res.nomination_type || "none",
      reservation_date: new Date(`${res.reservation_date}T00:00:00`),
      start_time: res.start_time.slice(0, 5),
      end_time: `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`,
      duration: res.duration,
      room: res.room || "",
      course_type: res.course_type || "アロマオイル",
      course_name: res.course_name,
      selectedOptions: res.options || [],
      discount_ids: res.discount_ids || [],
      discount: res.discount || 0,
      price: res.price,
      payment_method: res.payment_method || "cash",
      payment_fee: res.payment_fee || 0,
      reservation_method: res.reservation_method || "",
      notes: res.notes || "",
    });
    setIsEditOpen(true);
  };

  const handleUpdateReservation = async () => {
    if (!editingReservation) return;
    try {
      const { error } = await supabase.from("reservations").update({
        cast_id: editFormData.cast_id || null,
        customer_name: editFormData.customer_name,
        customer_phone: editFormData.customer_phone,
        customer_email: editFormData.customer_email || null,
        reservation_date: format(editFormData.reservation_date, "yyyy-MM-dd"),
        start_time: editFormData.start_time,
        duration: editFormData.duration,
        course_type: editFormData.course_type,
        course_name: editFormData.course_name,
        options: editFormData.selectedOptions,
        nomination_type: editFormData.nomination_type === "none" ? null : editFormData.nomination_type,
        price: editFormData.price,
        discount: editFormData.discount,
        discount_ids: editFormData.discount_ids,
        payment_method: editFormData.payment_method || null,
        payment_fee: editFormData.payment_fee || 0,
        reservation_method: editFormData.reservation_method || null,
        notes: editFormData.notes || null,
        room: editFormData.room || null,
      }).eq("id", editingReservation.id);
      if (error) throw error;
      toast({ title: "更新完了", description: "予約情報を更新しました" });
      setIsEditOpen(false);
      fetchReservations();
    } catch (error) {
      console.error("Error updating reservation:", error);
      toast({ title: "エラー", description: "予約の更新に失敗しました", variant: "destructive" });
    }
  };

  const fetchReservations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reservations")
        .select("*, casts(name)")
        .order("reservation_date", { ascending: false })
        .limit(500);

      if (error) throw error;
      setReservations(data || []);
    } catch (error) {
      console.error("Error fetching reservations:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredReservations = reservations.filter((res) => {
    const matchesSearch =
      res.customer_name.includes(searchQuery) ||
      res.customer_phone.includes(searchQuery) ||
      res.course_name.includes(searchQuery);
    const matchesStatus = statusFilter === "all" || res.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">予約一覧</h1>
              <p className="text-muted-foreground">全ての予約を確認・管理</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Sheet open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <SheetTrigger asChild>
                    <Button><Plus size={16} className="mr-2" />新規予約</Button>
                  </SheetTrigger>
                  <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>新しい予約を追加</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6">
                      <ReservationForm
                        formData={formData}
                        setFormData={setFormData}
                        casts={casts}
                        rooms={rooms}
                        backRates={backRates}
                        optionRates={optionRates}
                        nominationRates={nominationRates}
                        discounts={discounts}
                        onSubmit={handleAddReservation}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              )}
              <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                <FileUp size={16} className="mr-2" />CSVインポート
              </Button>
            </div>
          </div>

          <Tabs defaultValue="db" className="mb-6">
            <TabsList>
              <TabsTrigger value="db">データベース</TabsTrigger>
              <TabsTrigger value="sheet" className="gap-1.5">
                <Table2 size={13} />Googleスプレッドシート
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sheet" className="mt-4">
              <GoogleSheetPanel
                source="reservations"
                onImport={async (headers, rows) => {
                  const { data: castData } = await supabase.from("casts").select("id, name");
                  const castMap = new Map<string, string>();
                  (castData || []).forEach((c: { id: string; name: string }) => castMap.set(c.name, c.id));
                  const mapped = mapReservationRows(headers, rows, castMap);
                  if (mapped.length === 0 && rows.length > 0) {
                    throw new Error(
                      `日付を認識できる行がありませんでした。「予約日」列の日付形式をご確認ください（検出した列: ${headers.filter(Boolean).join(" / ")}）`
                    );
                  }
                  const count = await batchInsert("reservations", mapped);
                  await fetchReservations();
                  return count;
                }}
              />
            </TabsContent>
            <TabsContent value="db">

          {/* 検索・フィルター */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <Search size={18} className="text-muted-foreground" />
                    <Input
                      placeholder="顧客名・電話番号・コース名で検索..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    <SelectItem value="pending">確認中</SelectItem>
                    <SelectItem value="sms_waiting">SMS送信待ち</SelectItem>
                    <SelectItem value="confirmed">来店待ち</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                    <SelectItem value="cancelled">キャンセル</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 予約テーブル */}
          {loading ? (
            <div className="text-center text-muted-foreground">読み込み中...</div>
          ) : filteredReservations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              予約がありません
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">日付</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">時間</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">顧客名</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">電話番号</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">セラピスト</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">コース</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">料金</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">ステータス</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredReservations.map((res) => (
                      <tr key={res.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {format(new Date(res.reservation_date), "yyyy/MM/dd", { locale: ja })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {toExtTime(res.start_time)}<span className="text-muted-foreground ml-1">({res.duration}分)</span>
                        </td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{res.customer_name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{res.customer_phone}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{res.casts?.name ?? <span className="text-muted-foreground">未設定</span>}</td>
                        <td className="px-4 py-3">{res.course_name}</td>
                        <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">¥{res.price.toLocaleString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[res.status] ?? "bg-gray-100 text-gray-700"}`}>
                            {STATUS_LABELS[res.status] ?? res.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditSheet(res)}
                          >
                            <Pencil size={14} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>予約情報を編集</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <ReservationForm
              formData={editFormData}
              setFormData={setEditFormData}
              casts={casts}
              rooms={rooms}
              backRates={backRates}
              optionRates={optionRates}
              nominationRates={nominationRates}
              discounts={discounts}
              onSubmit={handleUpdateReservation}
              submitLabel="更新する"
            />
          </div>
        </SheetContent>
      </Sheet>
      <ImportModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        type="reservations"
        onSuccess={fetchReservations}
      />
    </div>
  );
}
