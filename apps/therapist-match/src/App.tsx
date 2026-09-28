import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Home from "@/pages/Home";
import MyPage from "@/pages/MyPage";
import Register from "@/pages/Register";
import StoreDetail from "@/pages/StoreDetail";
import Stores from "@/pages/Stores";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminLaunch from "@/pages/admin/Launch";
import AdminSimulator from "@/pages/admin/Simulator";
import AdminStores from "@/pages/admin/Stores";
import AdminTherapists from "@/pages/admin/Therapists";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/stores" element={<Stores />} />
        <Route path="/stores/:id" element={<StoreDetail />} />
        <Route path="/me" element={<MyPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/therapists" element={<AdminTherapists />} />
        <Route path="/admin/stores" element={<AdminStores />} />
        <Route path="/admin/simulator" element={<AdminSimulator />} />
        <Route path="/admin/launch" element={<AdminLaunch />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
