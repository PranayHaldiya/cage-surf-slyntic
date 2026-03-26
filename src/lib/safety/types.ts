export type Verdict = "safe" | "suspicious" | "likely_scam";

export type ScamSignal =
  | "otp_request"
  | "pin_password_request"
  | "urgency_pressure"
  | "payment_request"
  | "threat_language"
  | "remote_access_request"
  | "suspicious_link"
  | "impersonation_claim"
  | "upi_collect_request"
  | "gift_card_request"
  | "credential_reset_pressure";

export interface EvidenceItem {
  title: string;
  url: string;
  snippet?: string;
}

export interface ExtractedEntities {
  urls: string[];
  phoneNumbers: string[];
  upiIds: string[];
  organizations: string[];
  moneyMentions: string[];
}

export interface SafetyAnalyzeResponse {
  claimText: string;
  score: number;
  verdict: Verdict;
  signals: ScamSignal[];
  reasons: string[];
  evidence: EvidenceItem[];
  entities: ExtractedEntities;
  generatedAt: string;
}
