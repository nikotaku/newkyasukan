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
import { Search, FileUp } from "lucide-react";
import { ImportModal } from "@/components/ImportModal";

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
  casts: { name: string };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-blue-100 text-blue-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "確認中",
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
      let query = supabase
        .from("reservations")
        .select("*, casts(name)")
        .order("reservation_date", { ascending: false })
        .limit(500);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setReservations(data || []);
    } catch (error) {
      console.error("Error fetching reservations:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredReservations = reservations.filter(
    (res) =>
      res.customer_name.includes(searchQuery) ||
      res.customer_phone.includes(searchQuery) ||
      res.course_name.includes(searchQuery)
  );

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
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    <SelectItem value="pending">確認中</SelectItem>
                    <SelectItem value="confirmed">確定</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                    <SelectItem value="cancelled">キャンセル</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-center text-muted-foreground">読み込み中...</div>
          ) : filteredReservations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              予約がありません
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReservations.map((res) => (
                <Card key={res.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="font-semibold">{res.customer_name}</div>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            STATUS_COLORS[res.status]
                          }`}
                        >
                          {STATUS_LABELS[res.status]}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>
                          {format(new Date(res.reservation_date), "yyyy/MM/dd", {
                            locale: ja,
                          })}{" "}
                          {res.start_time.slice(0, 5)} ({res.duration}分)
                        </div>
                        <div>
                          セラピスト: {res.casts.name} | {res.course_name}
                        </div>
                        <div>電話: {res.customer_phone}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        ¥{res.price.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
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
