import { useState, useEffect } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Search } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  first_visit_date: string;
  total_spent: number;
  visit_count: number;
  last_visit_date: string | null;
}

export default function SalesCustomerInfo() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("total_spent", { ascending: false });

      if (error && error.code !== "PGRST116") throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.includes(searchQuery) ||
      c.phone.includes(searchQuery) ||
      c.email.includes(searchQuery)
  );

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-[60px] md:ml-[240px] p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">顧客情報</h1>
            <p className="text-muted-foreground">
              顧客の売上・来店情報
            </p>
          </div>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Search size={18} className="text-muted-foreground" />
                <Input
                  placeholder="顧客名・電話番号・メールで検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-center text-muted-foreground">
              読み込み中...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              顧客がありません
            </div>
          ) : (
            <div className="space-y-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold">顧客名</th>
                    <th className="text-left py-3 px-4 font-semibold">電話番号</th>
                    <th className="text-left py-3 px-4 font-semibold">総売上</th>
                    <th className="text-left py-3 px-4 font-semibold">来店回数</th>
                    <th className="text-left py-3 px-4 font-semibold">初回来店</th>
                    <th className="text-left py-3 px-4 font-semibold">最終来店</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-4">{customer.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {customer.phone}
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        ¥{(customer.total_spent || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {customer.visit_count || 0}回
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {customer.first_visit_date
                          ? format(new Date(customer.first_visit_date), "yyyy/MM/dd", {
                              locale: ja,
                            })
                          : "-"}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {customer.last_visit_date
                          ? format(new Date(customer.last_visit_date), "yyyy/MM/dd", {
                              locale: ja,
                            })
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
