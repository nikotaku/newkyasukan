export const DOUBLE_COURSE_TYPE = "Wセラピストコース";
export const DOUBLE_DURATIONS = [60, 80, 100];
export const DOUBLE_NOMINATION_TYPE = "特別指名料";
export const DOUBLE_OPTION_LABELS: Record<string, string> = {
  "オプションパック-双艶-": "双艶（そうえん）",
  "オプションパック-艶結-": "艶結（ゆいえん）",
};
export const DOUBLE_OPTION_NAMES = Object.keys(DOUBLE_OPTION_LABELS);

export const isDoubleBookingCourse = (rate: { course_type: string; duration: number }) =>
  rate.course_type === DOUBLE_COURSE_TYPE && DOUBLE_DURATIONS.includes(rate.duration);
