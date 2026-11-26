import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Component, ReactNode } from "react";
import { useGlobalHalfWidth } from "@/hooks/useGlobalHalfWidth";
import { StoreProvider } from "@/hooks/useStore";

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
import Customers from "./pages/Customers";
import Report from "./pages/Report";
import Salary from "./pages/Salary";
import Settings from "./pages/Settings";
import Pricing from "./pages/PricingManagement";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import TherapistPortal from "./pages/TherapistPortal";
import TherapistShiftSubmission from "./pages/TherapistShiftSubmission";
import PublicSchedule from "./pages/public/Schedule";
import StoreTop from "./pages/public/StoreTop";
import PublicCasts from "./pages/public/Casts";
import PublicCastDetail from "./pages/public/CastDetail";
import PublicCastDiary from "./pages/public/CastDiary";
import PublicPricing from "./pages/public/Pricing";
import PublicSystem from "./pages/public/System";
import PublicAccess from "./pages/public/Access";
import PublicLinks from "./pages/public/Links";
import ReservationGuide from "./pages/public/ReservationGuide";
import CastBannerRender from "./pages/public/CastBannerRender";
import BlogIndex from "./pages/public/BlogIndex";
import BlogArticle from "./pages/public/BlogArticle";
import NotionPageView from "./pages/NotionPageView";
import BookingReservation from "./pages/public/BookingReservation";
import Agreement from "./pages/Agreement";
import RoomSettings from "./pages/RoomSettings";
import SchedulePage from "./pages/Schedule";
import Expenses from "./pages/Expenses";
import MonthlyShift from "./pages/MonthlyShift";
import BusinessFlow from "./pages/BusinessFlow";
import HpDashboard from "./pages/HpDashboard";
import HpXOperations from "./pages/HpXOperations";
import HpKpiGoals from "./pages/HpKpiGoals";
import SalesCustomerInfo from "./pages/SalesCustomerInfo";
import SalesTherapistBreakdown from "./pages/SalesTherapistBreakdown";
import SalesPriceAnalysis from "./pages/SalesPriceAnalysis";
import SalesMonthlySales from "./pages/SalesMonthlySales";
import SalesDailySales from "./pages/SalesDailySales";
import SalesPendingReports from "./pages/SalesPendingReports";
import SalesDeductionSummary from "./pages/SalesDeductionSummary";
import SalesCardSales from "./pages/SalesCardSales";
import SalesPayPaySales from "./pages/SalesPayPaySales";
import SalesAdvertisingCost from "./pages/SalesAdvertisingCost";
import SalesReferralFees from "./pages/SalesReferralFees";
import SalesMonthlySalesTarget from "./pages/SalesMonthlySalesTarget";
import SalesDailySalesTarget from "./pages/SalesDailySalesTarget";
import SalesExpenseInput from "./pages/SalesExpenseInput";
import SalesMonthlyClosing from "./pages/SalesMonthlyClosing";
import TherapistDashboard from "./pages/TherapistDashboard";
import SettingsDashboard from "./pages/SettingsDashboard";
import SystemSMS from "./pages/SystemSMS";
import SystemSMSAuto from "./pages/SystemSMSAuto";
import TherapistCheckout from "./pages/TherapistCheckout";
import TherapistCleaningReport from "./pages/TherapistCleaningReport";
import SNSDatabase from "./pages/SNSDatabase";
import TherapistMyPage from "./pages/TherapistMyPage";
import CustomerDatabase from "./pages/CustomerDatabase";
import FacilitiesRooms from "./pages/FacilitiesRooms";
import FacilitiesContractDetail from "./pages/FacilitiesContractDetail";
import FacilitiesEquipment from "./pages/FacilitiesEquipment";
import CastImport from "./pages/CastImport";
import ReservationImport from "./pages/ReservationImport";
import CustomerImport from "./pages/CustomerImport";
import SalesClosing from "./pages/SalesClosing";
import ImageStock from "./pages/ImageStock";
import MediaStrategy from "./pages/MediaStrategy";
import PromotionSchedule from "./pages/PromotionSchedule";
import InquiryStats from "./pages/InquiryStats";
import Tasks from "./pages/Tasks";
import SmsInbox from "./pages/SmsInbox";
import LineInbox from "./pages/LineInbox";
import TherapistNotices from "./pages/TherapistNotices";
import KnowledgeDashboard from "./pages/KnowledgeDashboard";
import TherapistManualAdmin from "./pages/TherapistManualAdmin";
import Bios from "./pages/Bios";
import CtiCalls from "./pages/CtiCalls";
import CustomerDetail from "./pages/CustomerDetail";
import CastPostManagement from "./pages/CastPostManagement";
import TherapistPostPage from "./pages/TherapistPostPage";
import SalesDashboard, { SalesTabRedirect } from "./pages/SalesDashboard";
import SalesData from "./pages/SalesData";
import ScheduleDashboard from "./pages/ScheduleDashboard";
import { ScheduleTabRedirect } from "./components/schedule/ScheduleTabRedirect";
import PanelPhotoManual from "./pages/PanelPhotoManual";
import CustomerServiceManual from "./pages/CustomerServiceManual";
import ZenryokuBookManual from "./pages/ZenryokuBookManual";
import RecruitmentCriteria from "./pages/RecruitmentCriteria";
import RecruitTalk from "./pages/RecruitTalk";
import RecruitScout from "./pages/RecruitScout";
import EstamaScout from "./pages/EstamaScout";
import ScoutInvitePage from "./pages/public/ScoutInvite";
import RecruitLpAnalytics from "./pages/RecruitLpAnalytics";
import InterviewGuide from "./pages/InterviewGuide";
import PaymentManagement from "./pages/PaymentManagement";
import Education from "./pages/Education";
import ProductLP from "./pages/public/ProductLP";
import Survey from "./pages/public/Survey";
import CustomerReview from "./pages/public/CustomerReview";
import Voice from "./pages/public/Voice";
import ReviewMaker from "./pages/public/ReviewMaker";
import CastBooking from "./pages/public/CastBooking";
import KeikaBooking from "./pages/public/KeikaBooking";
import SurveysAdmin from "./pages/SurveysAdmin";
import ReviewsAdmin from "./pages/ReviewsAdmin";
import Campaigns from "./pages/public/Campaigns";
import DispatchRegistration from "./pages/public/DispatchRegistration";
import NewsletterUnsubscribe from "./pages/public/NewsletterUnsubscribe";
import DispatchRegistrationAdmin from "./pages/DispatchRegistrationAdmin";
import { PublicSeo } from "@/components/public/PublicSeo";
import { BackendDownNotice } from "@/components/BackendDownNotice";

const queryClient = new QueryClient();

const App = () => {
  useGlobalHalfWidth();
  return (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <StoreProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BackendDownNotice />
      <BrowserRouter>
        <Routes>
          {/* Public Pages */}
          <Route path="/" element={<StoreTop />} />
          <Route path="/schedule" element={<PublicSchedule />} />
          <Route path="/casts" element={<PublicCasts />} />
          <Route path="/casts/:id" element={<PublicCastDetail />} />
          <Route path="/casts/:id/diary" element={<PublicCastDiary />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/pricing" element={<PublicPricing />} />
          <Route path="/system" element={<PublicSystem />} />
          <Route path="/access" element={<PublicAccess />} />
          <Route path="/links" element={<PublicLinks />} />
          <Route path="/g/:token" element={<ReservationGuide />} />
          <Route path="/banner-render" element={<CastBannerRender />} />
          <Route path="/blog" element={<BlogIndex />} />
          <Route path="/blog/:slug" element={<BlogArticle />} />
          <Route path="/booking" element={<BookingReservation />} />
          <Route path="/page/:slug" element={<NotionPageView />} />
          <Route path="/lp" element={<ProductLP />} />
          <Route path="/survey" element={<Survey />} />
          <Route path="/review" element={<CustomerReview />} />
          <Route path="/review-maker" element={<ReviewMaker />} />
          <Route path="/book/keika" element={<KeikaBooking />} />
          <Route path="/book/:castId" element={<CastBooking />} />
          <Route path="/r/:castKey" element={<CastBooking />} />
          <Route path="/haru" element={<Navigate to="/r/4b2fc0c8" replace />} />
          <Route path="/voice" element={<Voice />} />
          <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribe />} />
          <Route path="/dispatch-registration/:token" element={<DispatchRegistration />} />
          
          {/* Admin/Staff Pages */}
          <Route path="/login" element={<Auth />} />
          <Route path="/dashboard" element={<Navigate to="/admin-schedule" replace />} />
          <Route path="/schedule-dashboard" element={<ScheduleDashboard />} />
          <Route path="/admin-schedule" element={<SchedulePage />} />
          <Route path="/schedule/monthly-shift" element={<MonthlyShift />} />
          {/* 以前のURLはスケジュールダッシュボードの該当タブへ（予約一覧は以前のWEB予約受付を引き継いだ） */}
          <Route path="/schedule/web-bookings" element={<ScheduleTabRedirect tab="reservations" />} />
          <Route path="/schedule/reservations-list" element={<ScheduleTabRedirect tab="reservations" source="staff" />} />
          <Route path="/schedule/estama-sync-history" element={<ScheduleTabRedirect tab="estama" />} />
          <Route path="/schedule/available-slots" element={<ScheduleTabRedirect tab="slots" />} />
          <Route path="/therapists/dashboard" element={<TherapistDashboard />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/staff/dispatch-registration" element={<DispatchRegistrationAdmin />} />
          <Route path="/shift" element={<Shift />} />
          <Route path="/shift/submission" element={<ShiftSubmission />} />
          <Route path="/reservations" element={<ScheduleTabRedirect tab="reservations" source="staff" />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/agreement" element={<Agreement />} />
          <Route path="/rooms" element={<RoomSettings />} />
          <Route path="/design" element={<Navigate to="/hp/dashboard?tab=banners" replace />} />
          <Route path="/hp/blog" element={<Navigate to="/hp/dashboard?tab=blog" replace />} />
          <Route path="/hp/dashboard" element={<HpDashboard />} />
          <Route path="/hp/article-creation" element={<Navigate to="/hp/dashboard?tab=news" replace />} />
          <Route path="/hp/business-flow" element={<BusinessFlow />} />
          <Route path="/hp/top-banners" element={<Navigate to="/hp/dashboard?tab=banners" replace />} />
          <Route path="/hp/kpi-goals" element={<SalesTabRedirect tab="kpi" />} />
          <Route path="/hp/store-info" element={<Navigate to="/hp/dashboard?tab=store" replace />} />
          <Route path="/hp/sns-links" element={<Navigate to="/hp/dashboard?tab=sns" replace />} />
          <Route path="/hp/x-operations" element={<HpXOperations />} />
          <Route path="/hp/recommended-menu" element={<Navigate to="/hp/dashboard?tab=banners" replace />} />
          <Route path="/report" element={<Report />} />
          <Route path="/salary" element={<Salary />} />
          <Route path="/pricing-management" element={<Pricing />} />
          <Route path="/shop" element={<Settings />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/board" element={<Navigate to="/hp/dashboard" replace />} />
          <Route path="/knowledge/dashboard" element={<KnowledgeDashboard />} />
          <Route path="/knowledge" element={<Navigate to="/knowledge/dashboard?tab=knowledge" replace />} />
          <Route path="/knowledge/passwords" element={<Navigate to="/knowledge/dashboard?tab=passwords" replace />} />
          <Route path="/templates" element={<Navigate to="/knowledge/dashboard?tab=templates" replace />} />
          <Route path="/image-stock" element={<ImageStock />} />
          <Route path="/marketing/media" element={<MediaStrategy />} />
          <Route path="/marketing/o2" element={<Navigate to="/education?tab=sns" replace />} />
          <Route path="/promotion-schedule" element={<PromotionSchedule />} />
          <Route path="/inquiry-stats" element={<InquiryStats />} />
          <Route path="/cti-calls" element={<CtiCalls />} />
          <Route path="/sales" element={<SalesDashboard />} />
          <Route path="/sales/data" element={<SalesData />} />
          <Route path="/sales/customer-info" element={<SalesCustomerInfo />} />
          <Route path="/sales/closing" element={<SalesClosing />} />
          <Route path="/sales/therapist-breakdown" element={<SalesTherapistBreakdown />} />
          <Route path="/sales/price-analysis" element={<SalesPriceAnalysis />} />
          <Route path="/sales/monthly-sales" element={<SalesMonthlySales />} />
          <Route path="/sales/daily-sales" element={<SalesTabRedirect tab="daily" />} />
          <Route path="/sales/monthly-closing" element={<SalesMonthlyClosing />} />
          <Route path="/sales/pending-reports" element={<SalesPendingReports />} />
          <Route path="/sales/deduction-summary" element={<SalesDeductionSummary />} />
          <Route path="/sales/card-sales" element={<SalesCardSales />} />
          <Route path="/sales/paypay-sales" element={<SalesPayPaySales />} />
          <Route path="/sales/advertising-cost" element={<SalesAdvertisingCost />} />
          <Route path="/sales/referral-fees" element={<SalesReferralFees />} />
          <Route path="/sales/monthly-target" element={<SalesMonthlySalesTarget />} />
          <Route path="/sales/daily-target" element={<SalesDailySalesTarget />} />
          <Route path="/sales/expense-input" element={<SalesExpenseInput />} />
          {/* システムの設定は設定ダッシュボード（/system/dashboard?tab=…）にまとめた。以前のURLは該当のタブへ */}
          <Route path="/system/dashboard" element={<SettingsDashboard />} />
          <Route path="/system/rate-master" element={<Navigate to="/system/dashboard?tab=all" replace />} />
          <Route path="/system/courses" element={<Navigate to="/system/dashboard?tab=course" replace />} />
          <Route path="/system/options" element={<Navigate to="/system/dashboard?tab=option" replace />} />
          <Route path="/system/discounts" element={<Navigate to="/system/dashboard?tab=discount" replace />} />
          <Route path="/system/payment-methods" element={<Navigate to="/system/dashboard?tab=payment" replace />} />
          <Route path="/system/deductions" element={<Navigate to="/system/dashboard?tab=deduction" replace />} />
          <Route path="/system/allowances" element={<Navigate to="/system/dashboard?tab=allowance" replace />} />
          <Route path="/system/referral-rewards" element={<Navigate to="/system/dashboard?tab=referral" replace />} />
          <Route path="/system/sms" element={<SystemSMS />} />
          <Route path="/system/sms-auto" element={<SystemSMSAuto />} />
          <Route path="/system/page-content" element={<Navigate to="/system/dashboard?tab=page" replace />} />
          <Route path="/database/knowledge/sns" element={<SNSDatabase />} />
          <Route path="/database/therapist/mypage" element={<TherapistMyPage />} />
          <Route path="/database/customers" element={<CustomerDatabase />} />
          <Route path="/database/customers/:id" element={<CustomerDetail />} />
          <Route path="/database/surveys" element={<SurveysAdmin />} />
          <Route path="/database/reviews" element={<ReviewsAdmin />} />
          <Route path="/facilities/rooms" element={<FacilitiesRooms />} />
          <Route path="/facilities/contracts" element={<Navigate to="/knowledge/dashboard?tab=contracts" replace />} />
          <Route path="/facilities/contracts/:id" element={<FacilitiesContractDetail />} />
          <Route path="/facilities/equipment" element={<FacilitiesEquipment />} />
          <Route path="/admin/import-casts" element={<CastImport />} />
          <Route path="/admin/import-reservations" element={<ReservationImport />} />
          <Route path="/admin/import-customers" element={<CustomerImport />} />
          
          {/* Therapist Portal - Token-based access */}
          <Route path="/therapist/:token" element={<TherapistPortal />} />
          <Route path="/therapist/:token/shift" element={<TherapistShiftSubmission />} />
          <Route path="/therapist/:token/checkout" element={<TherapistCheckout />} />
          <Route path="/therapist/:token/cleaning-report" element={<TherapistCleaningReport />} />
          <Route path="/therapist/:token/posts" element={<TherapistPostPage />} />
          <Route path="/post-management" element={<CastPostManagement />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/sms" element={<SmsInbox />} />
          <Route path="/line-inbox" element={<LineInbox />} />
          <Route path="/settings/notifications" element={<Navigate to="/system/dashboard?tab=notifications" replace />} />
          <Route path="/settings/phone" element={<Navigate to="/system/dashboard?tab=phone" replace />} />
          <Route path="/bios" element={<Bios />} />
          <Route path="/panel-manual" element={<PanelPhotoManual />} />
          <Route path="/service-manual" element={<CustomerServiceManual />} />
          <Route path="/zenryoku-book" element={<ZenryokuBookManual />} />
          <Route path="/recruitment-criteria" element={<RecruitmentCriteria />} />
          <Route path="/recruit-talk" element={<RecruitTalk />} />
          <Route path="/recruit-scout" element={<RecruitScout />} />
          <Route path="/recruit/estama-scout" element={<EstamaScout />} />
          <Route path="/invite" element={<ScoutInvitePage />} />
          <Route path="/marketing/recruit-lp" element={<RecruitLpAnalytics />} />
          <Route path="/interview" element={<InterviewGuide />} />
          <Route path="/education" element={<Education />} />
          <Route path="/therapist-notices" element={<TherapistNotices />} />
          <Route path="/therapist-manual" element={<TherapistManualAdmin />} />

          {/* 以前の「引き継ぎセンター」はナレッジダッシュボードのタブへ */}
          <Route path="/business-continuity" element={<Navigate to="/knowledge/dashboard" replace />} />
          <Route path="/business-continuity/vendors" element={<Navigate to="/knowledge/dashboard?tab=contracts" replace />} />
          <Route path="/business-continuity/logins" element={<Navigate to="/knowledge/dashboard?tab=passwords" replace />} />
          <Route path="/business-continuity/fixed-costs" element={<Navigate to="/knowledge/dashboard?tab=money" replace />} />
          <Route path="/business-continuity/bank-accounts" element={<Navigate to="/knowledge/dashboard?tab=money" replace />} />
          <Route path="/payments" element={<SalesTabRedirect tab="payments" />} />
          <Route path="/business-continuity/contracts" element={<Navigate to="/knowledge/dashboard?tab=contracts" replace />} />
          <Route path="/purchase-orders" element={<Navigate to="/knowledge/dashboard?tab=orders" replace />} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <PublicSeo />
      </BrowserRouter>
    </TooltipProvider>
    </StoreProvider>
  </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;
