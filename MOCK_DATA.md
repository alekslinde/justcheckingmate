# Mock Data for Manual Testing

This project includes mock data for testing various scam detection and analysis features without needing real examples.

All mock data is stored in a single JSON file (`lib/fixtures/mock-data.json`) with TypeScript loaders that expose it with proper typing:
- `lib/fixtures/mockReports.ts` — loads reports, email headers, and computes feed stats
- `lib/fixtures/mockTrackingPixels.ts` — loads tracking pixel test emails

## Tracking Pixels

To test tracking pixel detection in the UI, use the mock data from `lib/fixtures/mockTrackingPixels.ts`:

### Available Mock Emails with Pixels

From `MOCK_EMAILS_WITH_PIXELS`:
- **`MAILCHIMP_WITH_RECIPIENT`** — Mailchimp pixel with base64-encoded recipient email (`victim@gmail.com`)
- **`SENDGRID_BASIC`** — SendGrid pixel without encoded recipient
- **`KLAVIYO_ENCODED_PATH`** — Klaviyo pixel with base64url email in the URL path
- **`MULTIPLE_ESPS`** — Multiple pixels from different platforms (Mailchimp + SendGrid)
- **`CAMPAIGN_MONITOR`** — Campaign Monitor pixel
- **`HUBSPOT`** — HubSpot pixel
- **`TRACKING_URL_OUTSIDE_IMG`** — Tracking URL as a `<link preload>` (not in an `<img>` tag)
- **`UNKNOWN_ESP_TRACKING_PATH`** — Unknown ESP but detectable via `/pixel/` path pattern
- **`NO_PIXELS`** — Clean email without tracking pixels (control case)

From `MOCK_REPORT_EMAILS_WITH_PIXELS` (for ReportForm testing):
- **`FULL_PHISHING_WITH_MAILCHIMP`** — Complete email with headers and Mailchimp pixel
- **`MULTI_PLATFORM_PIXELS`** — Email with 3 pixels from different platforms

### How to Use

1. Open the **justcheckingmate** app in your browser
2. Go to the homepage or open the ReportForm
3. Copy the `.content` value from the mock data (e.g., `MOCK_EMAILS_WITH_PIXELS.MAILCHIMP_WITH_RECIPIENT.content`)
4. Paste into the textarea / form input
5. The app will detect tracking pixels and display:
   - Which ESP (email service provider) sent them
   - Recipient addresses encoded in the pixel URL (if any)
   - Summary of findings in the result card

## Other Mock Data

### Email Headers (Authentication Testing)

From `MOCK_EMAIL_HEADERS`:
- `ALL_FLAGS` — All authentication failures + display name masking
- `DKIM_UNRELATED_TENANT` — DKIM from unrelated tenant
- `COMMBANK_PHISH` — CommBank impersonation
- `ATO_PHISH` — ATO phishing
- `LEGITIMATE` — Legitimate email (control)
- `FOREIGN_LOCALE` — Foreign language flags

### Sample Reports

From `MOCK_REPORTS`, `MOCK_FEED_STATS`, and `MOCK_EMAIL_HEADERS`:
- `MOCK_REPORTS` — 14 sample reports across all scam types (URL, SMS, phone, email, custom)
- `MOCK_FEED_STATS` — Aggregated stats (by type, by day) derived from the sample reports
- `MOCK_TOTAL` — Total number of sample reports

Import from the fixtures module:
```typescript
import { MOCK_REPORTS, MOCK_FEED_STATS, MOCK_EMAIL_HEADERS } from "@/lib/fixtures/mockReports";
```

## Integration in Tests

Example usage in a test:

```typescript
import { analyseTrackingPixels } from "@/lib/trackingPixel";
import { MOCK_EMAILS_WITH_PIXELS } from "@/lib/fixtures/mockTrackingPixels";

it("should detect tracking pixels in phishing emails", () => {
  const result = analyseTrackingPixels(MOCK_EMAILS_WITH_PIXELS.MAILCHIMP_WITH_RECIPIENT.content);
  expect(result.hasTrackingPixels).toBe(true);
  expect(result.espsUsed).toContain("Mailchimp");
  expect(result.embeddedRecipients).toContain("victim@gmail.com");
});
```

Example for report mocks:

```typescript
import { MOCK_REPORTS, MOCK_FEED_STATS } from "@/lib/fixtures/mockReports";

it("should have 14 sample reports", () => {
  expect(MOCK_REPORTS).toHaveLength(14);
});

it("should count reports by type in feed stats", () => {
  const urlCount = MOCK_FEED_STATS.byType.find((t) => t.type === "email")?.count;
  expect(urlCount).toBeGreaterThan(0);
});
```

## Why These Mocks?

- **No network calls** — All analysis is string-based; pixels are never triggered
- **Comprehensive coverage** — Tests various ESP platforms, encoding schemes, and edge cases
- **Realistic examples** — Based on actual phishing patterns but fully synthetic
- **Minimal change surface** — Easy to add new mocks without modifying existing data
