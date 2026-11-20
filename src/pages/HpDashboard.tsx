import { Navigate, useSearchParams } from "react-router-dom";

export default function HpDashboard() {
  const [params] = useSearchParams();
  return <Navigate to={`/system/dashboard?tab=${encodeURIComponent(params.get("tab") || "store")}`} replace />;
}
