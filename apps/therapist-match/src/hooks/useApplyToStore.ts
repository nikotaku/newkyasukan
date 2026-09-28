import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApp } from "@/hooks/useApp";

// 応募は登録済みの人だけ。未登録なら登録画面へ送り、終わったら元のお店に戻す
export function useApplyToStore() {
  const { me, applyToStore } = useApp();
  const navigate = useNavigate();
  return (storeId: string) => {
    if (!me) {
      toast("応募の前に1分で登録をお願いします");
      navigate("/register", { state: { returnTo: `/stores/${storeId}` } });
      return;
    }
    applyToStore(storeId);
    toast.success("応募しました。面接の日程はコーチが一緒に調整します");
  };
}
