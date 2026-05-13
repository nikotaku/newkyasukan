import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Component, ReactNode } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "sans-serif" }}>
          <h1 style={{ color: "#c00" }}>アプリ読み込みエラー</h1>
          <pre style={{ background: "#f5f5f5", padding: 16, overflow: "auto", fontSize: 13 }}>
            {(this.state.error as Error).message}
            {"\n"}
            {(this.state.error as Error).stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: "8px 16px" }}>
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import Staff from "./pages/Staff";
import Shift from "./pages/Shift";
import ShiftSubmission from "./pages/ShiftSubmission";
import Reservations from "./pages/Reservations";
import Customers from "./pages/Customers";
import Design from "./pages/Design";
import Report from "./pages/Report";
import Salary from "./pages/Salary";
import Settings from "./pages/Settings";
import Pricing from "./pages/PricingManagement";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import TherapistPortal from "./pages/TherapistPortal";
import TherapistShiftSubmission from "./pages/TherapistShiftSubmission";
import PublicSchedule from "./pages/public/Schedule";
import Top from "./pages/public/Top";
import PublicCasts from "./pages/public/Casts";
import PublicCastDetail from "./pages/public/CastDetail";
import PublicPricing from "./pages/public/Pricing";
import PublicSystem from "./pages/public/System";
import PublicAccess from "./pages/public/Access";
import NotionPageView from "./pages/NotionPageView";
import BookingReservation from "./pages/public/BookingReservation";
import TextGeneration from "./pages/TextGeneration";
import Agreement from "./pages/Agreement";
import RoomSettings from "./pages/RoomSettings";
import SchedulePage from "./pages/Schedule";
import Expenses from "./pages/Expenses";
import Board from "./pages/Board";
import Knowledge from "./pages/Knowledge";
import News from "./pages/public/News";
import MonthlyShift from "./pages/MonthlyShift";
import ReservationsList from "./pages/ReservationsList";
import AvailableSlots from "./pages/AvailableSlots";
import HPBulletinBoard from "./pages/HPBulletinBoard";
import ArticleCreation from "./pages/ArticleCreation";
import StoreInfo from "./pages/StoreInfo";
import AnalyticsDailyAccess from "./pages/AnalyticsDailyAccess";
import AnalyticsHourlyAccess from "./pages/AnalyticsHourlyAccess";
import AnalyticsAverageStay from "./pages/AnalyticsAverageStay";
import AnalyticsTracking from "./pages/AnalyticsTracking";
import SalesCustomerInfo from "./pages/SalesCustomerInfo";
import SalesTherapistBreakdown from "./pages/SalesTherapistBreakdown";
import SalesPriceAnalysis from "./pages/SalesPriceAnalysis";
import SalesMonthlySales from "./pages/SalesMonthlySales";
import SalesCardSales from "./pages/SalesCardSales";
import SalesPayPaySales from "./pages/SalesPayPaySales";
import SalesAdvertisingCost from "./pages/SalesAdvertisingCost";
import SalesReferralFees from "./pages/SalesReferralFees";
import SalesMonthlySalesTarget from "./pages/SalesMonthlySalesTarget";
import SalesDailySalesTarget from "./pages/SalesDailySalesTarget";
import SalesExpenseInput from "./pages/SalesExpenseInput";
import SystemCourses from "./pages/SystemCourses";
import SystemOptions from "./pages/SystemOptions";
import SystemDiscounts from "./pages/SystemDiscounts";
import SystemDeductions from "./pages/SystemDeductions";
import SystemAllowances from "./pages/SystemAllowances";
import SystemSMS from "./pages/SystemSMS";
import SystemSMSAuto from "./pages/SystemSMSAuto";
import TherapistCheckout from "./pages/TherapistCheckout";
import SNSDatabase from "./pages/SNSDatabase";
import TherapistDatabase from "./pages/TherapistDatabase";
import TherapistMyPage from "./pages/TherapistMyPage";
import CustomerDatabase from "./pages/CustomerDatabase";
import FacilitiesRooms from "./pages/FacilitiesRooms";
import FacilitiesContracts from "./pages/FacilitiesContracts";
import FacilitiesContractDetail from "./pages/FacilitiesContractDetail";
import FacilitiesEquipment from "./pages/FacilitiesEquipment";
import CastImport from "./pages/CastImport";
import ReservationImport from "./pages/ReservationImport";
import CustomerImport from "./pages/CustomerImport";
import SalesClosing from "./pages/SalesClosing";
import Analytics from "./pages/Analytics";
import TextTemplates from "./pages/TextTemplates";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public Pages */}
          <Route path="/" element={<Top />} />
          <Route path="/schedule" element={<PublicSchedule />} />
          <Route path="/casts" element={<PublicCasts />} />
          <Route path="/casts/:id" element={<PublicCastDetail />} />
          <Route path="/pricing" element={<PublicPricing />} />
          <Route path="/system" element={<PublicSystem />} />
          <Route path="/access" element={<PublicAccess />} />
          <Route path="/news" element={<News />} />
          <Route path="/booking" element={<BookingReservation />} />
          <Route path="/page/:slug" element={<NotionPageView />} />
          
          {/* Admin/Staff Pages */}
          <Route path="/login" element={<Auth />} />
          <Route path="/dashboard" element={<Navigate to="/admin-schedule" replace />} />
          <Route path="/admin-schedule" element={<SchedulePage />} />
          <Route path="/schedule/monthly-shift" element={<MonthlyShift />} />
          <Route path="/schedule/reservations-list" element={<ReservationsList />} />
          <Route path="/schedule/available-slots" element={<AvailableSlots />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/shift" element={<Shift />} />
          <Route path="/shift/submission" element={<ShiftSubmission />} />
          <Route path="/reservations" element={<Reservations />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/agreement" element={<Agreement />} />
          <Route path="/rooms" element={<RoomSettings />} />
          <Route path="/design" element={<Design />} />
          <Route path="/hp/bulletin-board" element={<HPBulletinBoard />} />
          <Route path="/hp/article-creation" element={<ArticleCreation />} />
          <Route path="/hp/store-info" element={<StoreInfo />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/hp/analytics/daily-access" element={<AnalyticsDailyAccess />} />
          <Route path="/hp/analytics/hourly-access" element={<AnalyticsHourlyAccess />} />
          <Route path="/hp/analytics/average-stay" element={<AnalyticsAverageStay />} />
          <Route path="/hp/analytics/tracking" element={<AnalyticsTracking />} />
          <Route path="/report" element={<Report />} />
          <Route path="/salary" element={<Salary />} />
          <Route path="/pricing-management" element={<Pricing />} />
          <Route path="/text-generation" element={<TextGeneration />} />
          <Route path="/shop" element={<Settings />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/board" element={<Board />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/templates" element={<TextTemplates />} />
          <Route path="/sales/customer-info" element={<SalesCustomerInfo />} />
          <Route path="/sales/closing" element={<SalesClosing />} />
          <Route path="/sales/therapist-breakdown" element={<SalesTherapistBreakdown />} />
          <Route path="/sales/price-analysis" element={<SalesPriceAnalysis />} />
          <Route path="/sales/monthly-sales" element={<SalesMonthlySales />} />
          <Route path="/sales/card-sales" element={<SalesCardSales />} />
          <Route path="/sales/paypay-sales" element={<SalesPayPaySales />} />
          <Route path="/sales/advertising-cost" element={<SalesAdvertisingCost />} />
          <Route path="/sales/referral-fees" element={<SalesReferralFees />} />
          <Route path="/sales/monthly-target" element={<SalesMonthlySalesTarget />} />
          <Route path="/sales/daily-target" element={<SalesDailySalesTarget />} />
          <Route path="/sales/expense-input" element={<SalesExpenseInput />} />
          <Route path="/system/courses" element={<SystemCourses />} />
          <Route path="/system/options" element={<SystemOptions />} />
          <Route path="/system/discounts" element={<SystemDiscounts />} />
          <Route path="/system/deductions" element={<SystemDeductions />} />
          <Route path="/system/allowances" element={<SystemAllowances />} />
          <Route path="/system/sms" element={<SystemSMS />} />
          <Route path="/system/sms-auto" element={<SystemSMSAuto />} />
          <Route path="/database/knowledge/sns" element={<SNSDatabase />} />
          <Route path="/database/therapist/profiles" element={<TherapistDatabase />} />
          <Route path="/database/therapist/mypage" element={<TherapistMyPage />} />
          <Route path="/database/customers" element={<CustomerDatabase />} />
          <Route path="/facilities/rooms" element={<FacilitiesRooms />} />
          <Route path="/facilities/contracts" element={<FacilitiesContracts />} />
          <Route path="/facilities/contracts/:id" element={<FacilitiesContractDetail />} />
          <Route path="/facilities/equipment" element={<FacilitiesEquipment />} />
          <Route path="/admin/import-casts" element={<CastImport />} />
          <Route path="/admin/import-reservations" element={<ReservationImport />} />
          <Route path="/admin/import-customers" element={<CustomerImport />} />
          
          {/* Therapist Portal - Token-based access */}
          <Route path="/therapist/:token" element={<TherapistPortal />} />
          <Route path="/therapist/:token/shift" element={<TherapistShiftSubmission />} />
          <Route path="/therapist/:token/checkout" element={<TherapistCheckout />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;