import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface TabMenuProps {
  activeDate: string;
  dates: { date: string; label: string }[];
  onDateChange: (date: string) => void;
}

export const TabMenu = ({ activeDate, dates, onDateChange }: TabMenuProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      const elLeft = el.offsetLeft;
      const elWidth = el.offsetWidth;
      const containerWidth = container.offsetWidth;
      container.scrollTo({
        left: elLeft - containerWidth / 2 + elWidth / 2,
        behavior: "smooth",
      });
    }
  }, [activeDate]);

  return (
    <div ref={scrollRef} className="overflow-x-auto scrollbar-hide border-b border-border mb-4">
      <div className="flex gap-0 min-w-max">
        {dates.map((dateItem) => (
          <button
            key={dateItem.date}
            ref={activeDate === dateItem.date ? activeRef : undefined}
            onClick={() => onDateChange(dateItem.date)}
            className={cn(
              "px-4 py-3 text-xs font-medium border-l border-t border-r border-border rounded-t-md -mb-px transition-colors whitespace-nowrap",
              activeDate === dateItem.date
                ? "bg-muted/30 text-foreground"
                : "bg-card text-muted-foreground hover:bg-muted/10"
            )}
          >
            {dateItem.label}
          </button>
        ))}
      </div>
    </div>
  );
};
