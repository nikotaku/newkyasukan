import { useState, useEffect } from "react";
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
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Search, FileUp, Table2 } from "lucide-react";
import { ImportModal } from "@/components/ImportModal";
import { GoogleSheetPanel } from "@/components/GoogleSheetPanel";
import { mapReservationRows, batchInsert } from "@/lib/importMappers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Reservation {
  id: string;
  customer_name: string;
  customer_phone: string;
  reservation_date: string;
  start_time: string;
  duration: number;
  course_name: string;
  price: number;
  status: string;
  casts: { name: string } | null;
}

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

function StatusBox({
  title,
  color,
  borderColor,
  reservations,
  onStatusChange,
}: {
  title: string;
  color: string;
  borderColor: string;
  reservations: Reservation[];
  onStatusChange: (id: string, status: string) => void;
}) {
  return (
    <div className={`rounded-lg border-2 ${borderColor} bg-white flex flex-col`}>
      <div className={`px-4 py-3 rounded-t-lg ${color} font-bold flex items-center justify-between`}>
        <span>{title}</span>
        <span className="text-sm font-normal opacity-80">{reservations.length}件</span>
      </div>
      <div className="flex-1 p-3 space-y-2 min-h-[120px] max-h-[400px] overflow-y-auto">
        {reservations.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">なし</p>
        ) : (
          reservations.map((res) => (
            <div key={res.id} className="bg-gray-50 rounded-md p-3 text-sm border border-gray-100">
              <div className="font-semibold mb-1">{res.customer_name}</div>
              <div className="text-muted-foreground text-xs space-y-0.5">
                <div>{format(new Date(res.reservation_date), "M/d", { locale: ja })} {res.start_time.slice(0, 5)} ({res.duration}分)</div>
                <div>{res.casts?.name ?? "未設定"} / {res.course_name}</div>
                <div>{res.customer_phone}</div>
              </div>
              <div className="mt-2 flex gap-1 flex-wrap">
                {["sms_waiting", "confirmed", "completed"].map((s) => (
                  <button
                    key={s}
                    onClick={() => onStatusChange(res.id, s)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      res.status === s
                        ? `${STATUS_COLORS[s]} border-transparent`
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ReservationsList() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [boxDate, setBoxDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchReservations();
    }
  }, [user]);

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

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("reservations")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      setReservations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
      );
    } catch (err) {
      console.error("Status update failed:", err);
    }
  };

  const todayReservations = reservations.filter((r) => r.reservation_date === boxDate);
  const smsWaiting = todayReservations.filter((r) => r.status === "sms_waiting");
  const visitWaiting = todayReservations.filter((r) => r.status === "confirmed");
  const completed = todayReservations.filter((r) => r.status === "completed");

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
            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <FileUp size={16} className="mr-2" />CSVインポート
            </Button>
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
                  const count = await batchInsert("reservations", mapped);
                  await fetchReservations();
                  return count;
                }}
              />
            </TabsContent>
            <TabsContent value="db">

          {/* ステータスBOX */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold text-sm text-muted-foreground">当日ステータス</h2>
              <input
                type="date"
                value={boxDate}
                onChange={(e) => setBoxDate(e.target.value)}
                className="text-sm border rounded px-2 py-1 text-muted-foreground"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatusBox
                title="📩 SMS送信待ち"
                color="bg-purple-100 text-purple-800"
                borderColor="border-purple-300"
                reservations={smsWaiting}
                onStatusChange={handleStatusChange}
              />
              <StatusBox
                title="🏃 来店待ち"
                color="bg-blue-100 text-blue-800"
                borderColor="border-blue-300"
                reservations={visitWaiting}
                onStatusChange={handleStatusChange}
              />
              <StatusBox
                title="✅ 接客完了"
                color="bg-emerald-100 text-emerald-800"
                borderColor="border-emerald-300"
                reservations={completed}
                onStatusChange={handleStatusChange}
              />
            </div>
          </div>

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
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredReservations.map((res) => (
                      <tr key={res.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {format(new Date(res.reservation_date), "yyyy/MM/dd", { locale: ja })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {res.start_time.slice(0, 5)}<span className="text-muted-foreground ml-1">({res.duration}分)</span>
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
      <ImportModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        type="reservations"
        onSuccess={fetchReservations}
      />
    </div>
  );
}
