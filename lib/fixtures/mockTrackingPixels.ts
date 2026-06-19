// Loads tracking pixel mock data from JSON file
import mockData from "./mock-data.json" assert { type: "json" };

export const MOCK_EMAILS_WITH_PIXELS = mockData.emailsWithTrackingPixels as Record<
  string,
  { description: string; content: string }
>;

export const MOCK_REPORT_EMAILS_WITH_PIXELS = mockData.reportEmailsWithPixels as Record<
  string,
  { description: string; content: string }
>;
