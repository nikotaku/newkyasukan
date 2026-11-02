export type TherapistPushSetupStep = "enable" | "confirm" | "complete";

interface DevicePushStatus {
  thisDevice: boolean;
  thisDeviceTestConfirmed: boolean;
}

/** 同じマイページの別端末が設定済みでも、この端末の設定・受取確認は省略しない。 */
export function therapistPushSetupStep(status: DevicePushStatus): TherapistPushSetupStep {
  if (!status.thisDevice) return "enable";
  return status.thisDeviceTestConfirmed ? "complete" : "confirm";
}
