import type { ExtractedEntities, ScamSignal } from "./types";

const signalRules: Array<{ signal: ScamSignal; pattern: RegExp }> = [
  { signal: "otp_request", pattern: /\botp\b|one[ -]?time password/i },
  { signal: "pin_password_request", pattern: /\bpin\b|password|cvv|mpin|passcode/i },
  { signal: "urgency_pressure", pattern: /urgent|immediately|right now|within \d+\s?(min|mins|minutes|hours?)|act now/i },
  { signal: "payment_request", pattern: /pay|payment|transfer|send money|wallet|crypto|deposit/i },
  { signal: "threat_language", pattern: /account.*(blocked|freeze|suspend)|legal action|police case|court notice|penalty/i },
  { signal: "remote_access_request", pattern: /anydesk|teamviewer|quicksupport|remote access|screen share|install app/i },
  { signal: "suspicious_link", pattern: /https?:\/\/[^\s]+|bit\.ly|tinyurl|t\.co|rb\.gy/i },
  { signal: "impersonation_claim", pattern: /i am from|this is.*(bank|rbi|police|income tax|customs|courier|amazon|google|microsoft|paytm|phonepe)/i },
  { signal: "upi_collect_request", pattern: /upi|collect request|approve request|scan qr|vpa/i },
  { signal: "gift_card_request", pattern: /gift card|apple card|google play card|steam card/i },
  { signal: "credential_reset_pressure", pattern: /verify kyc|reset account|re-?activate|re-?verify/i },
];

const urlRegex = /https?:\/\/[^\s)]+/gi;
const phoneRegex = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,6}/g;
const upiRegex = /[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}/g;
const moneyRegex = /(?:₹|rs\.?|inr|\$)\s?\d+[\d,]*/gi;
const orgRegex = /\b(?:bank|rbi|sbi|hdfc|icici|axis|kotak|paytm|phonepe|google pay|amazon|microsoft|income tax|police|courier)\b/gi;

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

export function extractSignals(claimText: string): ScamSignal[] {
  return uniq(signalRules.filter(({ pattern }) => pattern.test(claimText)).map(({ signal }) => signal)) as ScamSignal[];
}

export function extractEntities(claimText: string): ExtractedEntities {
  return {
    urls: uniq(claimText.match(urlRegex) ?? []),
    phoneNumbers: uniq(claimText.match(phoneRegex) ?? []),
    upiIds: uniq(claimText.match(upiRegex) ?? []),
    organizations: uniq(claimText.match(orgRegex) ?? []),
    moneyMentions: uniq(claimText.match(moneyRegex) ?? []),
  };
}
