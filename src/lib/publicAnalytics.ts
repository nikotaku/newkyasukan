/**
 * Public-site conversion events sent to the existing Google tag.
 * Event payloads intentionally exclude names, phone numbers, and other PII.
 */
type PublicEventParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackPublicEvent(eventName: string, params: PublicEventParams = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  window.gtag("event", eventName, params);
}
