import { useState, useEffect } from "react";
import { Bell, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface PaymentReminder {
  id: string;
  title: string;
  amount: number;
  day_of_month: number;
  memo: string | null;
}

const SESSION_KEY = "payment_reminder_dismissed";

function getDismissedKey() {
  const today = new Date();
  return `${SESSION_KEY}_${today.getFullYear()}_${today.getMonth() + 1}_${today.getDate()}`;
}

export function PaymentReminderPopup() {
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissedKey = getDismissedKey();
    if (sessionStorage.getItem(dismissedKey)) return;

    const today = new Date().getDate();
    (supabase as any)
      .from("payment_reminders")
      .select("id, title, amount, day_of_month, memo")
      .eq("day_of_month", today)
      .eq("active", true)
      .then(({ data }: { data: PaymentReminder[] | null }) => {
        if (data && data.length > 0) {
          setReminders(data);
          setOpen(true);
        }
      });
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(getDismissedKey(), "1");
    setOpen(false);
  };

  if (reminders.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <Bell size={18} className="text-amber-500" />
            本日の支払いリマインド
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-1">
          {reminders.map((r) => (
            <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{r.title}</span>
                {r.amount > 0 && (
                  <span className="text-base font-bold text-amber-800">
                    ¥{r.amount.toLocaleString()}
                  </span>
                )}
              </div>
              {r.memo && (
                <p className="text-xs text-muted-foreground whitespace-pre-line mt-1">{r.memo}</p>
              )}
            </div>
          ))}
        </div>
        <Button className="w-full mt-2" onClick={handleDismiss}>
          <Check size={16} />
          確認しました
        </Button>
      </DialogContent>
    </Dialog>
  );
}
