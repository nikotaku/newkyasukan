export type DraftClearanceSnapshot = {
  status?: string | null;
  cleared_at?: string | null;
  total_sales?: number | null;
  therapist_back?: number | null;
  draft_saved_at?: string | null;
};

const timestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function isFinalizedDailyClearance(clearance: DraftClearanceSnapshot | null | undefined) {
  return Boolean(clearance?.cleared_at);
}

export function resolveDraftTherapistBack(input: {
  clearance: DraftClearanceSnapshot | null | undefined;
  currentTotalSales: number;
  currentAutoBack: number;
  reservationUpdatedAts: Array<string | null | undefined>;
}) {
  const { clearance, currentTotalSales, currentAutoBack, reservationUpdatedAts } = input;
  if (!clearance) return { therapistBack: currentAutoBack, recalculated: false };

  const savedAt = timestamp(clearance.draft_saved_at);
  const reservationsChangedAfterDraft = savedAt > 0
    && reservationUpdatedAts.some((value) => timestamp(value) > savedAt);
  const totalChanged = Number(clearance.total_sales ?? 0) !== currentTotalSales;
  const staleDraft = clearance.status === "draft"
    && (totalChanged || reservationsChangedAfterDraft);

  return {
    therapistBack: staleDraft
      ? currentAutoBack
      : Number(clearance.therapist_back ?? currentAutoBack),
    recalculated: staleDraft,
  };
}
