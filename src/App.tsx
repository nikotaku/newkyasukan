import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

const queryClient = new QueryClient();

const App = () => (
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
          <Route path="/sales/customer-info" element={<SalesCustomerInfo />} />
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
          
          {/* Therapist Portal - Token-based access */}
          <Route path="/therapist/:token" element={<TherapistPortal />} />
          <Route path="/therapist/:token/shift" element={<TherapistShiftSubmission />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;