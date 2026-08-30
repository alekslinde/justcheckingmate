export const REPORT_TYPES = ["url", "sms", "email", "phone", "qr", "custom"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
