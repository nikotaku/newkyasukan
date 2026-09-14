export const shouldDisplayXSubAccount = (
  account: string | null | undefined,
  visible: boolean | null | undefined,
) => Boolean(account?.trim() && visible);
