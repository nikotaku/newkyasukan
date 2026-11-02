export interface TherapistPromotionTask {
  id: string;
  taskType: string;
  scheduledOn: string | null;
  groupLabel: string;
  label: string;
  isCompleted: boolean;
  completedAt: string | null;
  storeCompleted: boolean;
  sortOrder: number;
}

export interface TherapistPromotionPlan {
  id: string;
  title: string;
  therapistLabel: string;
  description: string | null;
  startsOn: string | null;
  endsOn: string | null;
  tasks: TherapistPromotionTask[];
  channels: Array<{
    key: string;
    label: string;
    count: number;
    sizeSpec: string | null;
    sortOrder: number;
  }>;
}

export interface TherapistPromotionReport {
  id: string;
  storeId: string;
  castId: string;
  castName: string;
  taskId: string;
  planId: string;
  planTitle: string;
  taskLabel: string;
  taskType: string;
  scheduledOn: string | null;
  completedAt: string;
  adminSeenAt: string | null;
}

export function promotionDate(value: string | null): string {
  if (!value) return "日付未設定";
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "日付未設定";
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

export function promotionReportedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function promotionPlanUrl(planId: string): string {
  return `/promotion-schedule?tab=plans&plan=${encodeURIComponent(planId)}`;
}

export function groupPromotionPostings(tasks: TherapistPromotionTask[]) {
  const groups = new Map<
    string,
    {
      key: string;
      date: string | null;
      label: string;
      tasks: TherapistPromotionTask[];
    }
  >();
  const sorted = tasks
    .filter((task) => task.taskType === "posting")
    .sort(
      (a, b) =>
        (a.scheduledOn ?? "9999").localeCompare(b.scheduledOn ?? "9999") ||
        a.sortOrder - b.sortOrder,
    );
  for (const task of sorted) {
    const key = `${task.scheduledOn ?? ""}:${task.groupLabel}`;
    const group = groups.get(key);
    if (group) group.tasks.push(task);
    else
      groups.set(key, {
        key,
        date: task.scheduledOn,
        label: task.groupLabel,
        tasks: [task],
      });
  }
  return [...groups.values()];
}

export function promotionPostingProgress(plans: TherapistPromotionPlan[]) {
  const postings = plans
    .flatMap((plan) => plan.tasks)
    .filter((task) => task.taskType === "posting");
  return {
    total: postings.length,
    completed: postings.filter((task) => task.isCompleted).length,
  };
}
