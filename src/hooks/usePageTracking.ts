import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    supabase.rpc("record_page_view", { p_path: location.pathname }).then(() => {}, () => {});
  }, [location.pathname]);
}
