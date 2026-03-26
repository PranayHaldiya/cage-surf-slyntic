import type { ScamSignal, Verdict } from "./types";

const weights: Record<ScamSignal, number> = {
  otp_request: 30,
  pin_password_request: 25,
  urgency_pressure: 15,
  payment_request: 20,
  threat_language: 15,
  remote_access_request: 20,
  suspicious_link: 10,
  impersonation_claim: 10,
  upi_collect_request: 20,
  gift_card_request: 25,
  credential_reset_pressure: 10,
};

export function scoreSignals(signals: ScamSignal[]): number {
  const total = signals.reduce((acc, s) => acc + weights[s], 0);
  return Math.min(100, total);
}

export function verdictFromScore(score: number): Verdict {
  if (score >= 60) return "likely_scam";
  if (score >= 25) return "suspicious";
  return "safe";
}

export function reasonsFromSignals(signals: ScamSignal[]): string[] {
  const map: Record<ScamSignal, string> = {
    otp_request: "Requested OTP (critical fraud pattern)",
    pin_password_request: "Asked for PIN/password/CVV credentials",
    urgency_pressure: "Used urgency pressure tactics",
    payment_request: "Asked for direct money transfer/payment",
    threat_language: "Used threats (freeze/suspension/legal action)",
    remote_access_request: "Requested remote device/screen access",
    suspicious_link: "Contains a potentially suspicious link",
    impersonation_claim: "Claimed authority or brand identity",
    upi_collect_request: "Mentions UPI collect request approval",
    gift_card_request: "Requested gift card payment method",
    credential_reset_pressure: "Pressed for KYC/account reset verification",
  };

  return signals.map((s) => map[s]);
}
