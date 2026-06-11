export const REPORT_TYPES = ["url", "sms", "email", "phone", "qr", "custom"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export function isValidReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}
