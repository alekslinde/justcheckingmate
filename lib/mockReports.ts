import { PublicReport } from "./reportStore";

// ── Raw email header blobs for manual testing in CheckFlow ───────────────────
// Paste any of these into the homepage input to exercise every analysis path.

export const MOCK_EMAIL_HEADERS = {
  // Worst case: display-name brand masking + From≠Reply-To + SPF fail + DMARC fail
  ALL_FLAGS: [
    "Delivered-To: victim@gmail.com",
    "From: myGov <noreply@au-taxrefund.click>",
    "Reply-To: support@telecom-helpdesk.ru",
    "Return-Path: <bounce@eu-mailer.net>",
    "Subject: Urgent: Your myGov account has been locked",
    "Received-SPF: fail (spf.google.com: domain of au-taxrefund.click does not designate 104.21.88.12 as permitted sender) client-ip=104.21.88.12",
    "Authentication-Results: mx.google.com; spf=fail smtp.mailfrom=au-taxrefund.click; dkim=none; dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=au-taxrefund.click",
    "",
    "Dear Customer, we have detected unusual activity on your myGov account.",
  ].join("\n"),

  // DKIM pass but signed by an unrelated Microsoft 365 tenant (real phish pattern)
  DKIM_UNRELATED_TENANT: [
    "Return-Path: <linus@uppent.se>",
    "Authentication-Results: bimi.icloud.com; bimi=skipped reason=\"insufficient dmarc\"",
    "Authentication-Results: dmarc.icloud.com; dmarc=none header.from=uppent.se",
    "Authentication-Results: dkim-verifier.icloud.com; dkim=pass header.d=markona.onmicrosoft.com header.i=@markona.onmicrosoft.com",
    "Received-SPF: pass (spf.icloud.com: domain of linus@uppent.se designates 52.102.163.63 as permitted sender) client-ip=52.102.163.63",
    "ARC-Authentication-Results: i=1; mx.microsoft.com 1; spf=pass; dmarc=pass action=none header.from=uppent.se; dkim=pass header.d=uppent.se; arc=none",
    "From: myGov <linus@uppent.se>",
    "Subject: myGov Notification",
    "Accept-Language: sv-SE, en-US",
    "",
    "Click here to verify your account.",
  ].join("\n"),

  // CommBank impersonation — display name masking + From≠Reply-To, SPF softfail
  COMMBANK_PHISH: [
    "From: CommonWealth Bank <secure-msg@commbank-alerts.info>",
    "Reply-To: helpdesk.commbank2024@gmail.com",
    "Return-Path: <bounce@commbank-alerts.info>",
    "Subject: Your CommBank account is temporarily restricted",
    "Received-SPF: softfail (domain of commbank-alerts.info does not strongly designate 198.51.100.22 as permitted sender) client-ip=198.51.100.22",
    "Authentication-Results: mx.google.com; spf=softfail smtp.mailfrom=commbank-alerts.info; dkim=pass header.d=sendgrid.net; dmarc=none",
    "",
    "Please verify your identity to restore access.",
  ].join("\n"),

  // ATO phishing — SPF fail + DMARC fail, display name in angle bracket
  ATO_PHISH: [
    "From: \"Australian Taxation Office\" <refunds@ato-secure.net>",
    "Reply-To: ato.refunds@protonmail.com",
    "Subject: Tax Refund Available — Action Required",
    "Received-SPF: fail (spf.protection.outlook.com: domain of ato-secure.net does not designate 203.0.113.5 as permitted sender) client-ip=203.0.113.5",
    "Authentication-Results: mx.google.com; spf=fail; dkim=fail; dmarc=fail (p=REJECT)",
    "",
    "You have a pending refund of $1,842.00. Click here to claim.",
  ].join("\n"),

  // Legitimate-looking email (all pass, aligned DKIM) — should produce no flags
  LEGITIMATE: [
    "From: no-reply@ato.gov.au",
    "Return-Path: <bounce@ato.gov.au>",
    "Subject: Your 2024 tax return has been processed",
    "Received-SPF: pass (spf.google.com: domain of ato.gov.au designates 203.0.113.1 as permitted sender) client-ip=203.0.113.1",
    "Authentication-Results: mx.google.com; spf=pass; dkim=pass header.d=ato.gov.au; dmarc=pass",
    "",
    "Your tax return has been processed. Log in to myGov to view the outcome.",
  ].join("\n"),

  // Non-English locale flag (Swedish locale on an ATO impersonator)
  FOREIGN_LOCALE: [
    "From: Medicare Australia <billing@medi-care-au.se>",
    "Subject: Medicare Rebate Available",
    "Accept-Language: sv-SE",
    "Received-SPF: pass (domain of medi-care-au.se designates 52.102.163.63 as permitted sender) client-ip=52.102.163.63",
    "Authentication-Results: mx.google.com; spf=pass; dkim=none; dmarc=none",
    "",
    "Your Medicare rebate of $182.40 is ready to collect.",
  ].join("\n"),
} as const;

const NOW = Date.now();
const mins  = (n: number) => NOW - n * 60_000;
const hours = (n: number) => NOW - n * 3_600_000;
const days  = (n: number) => NOW - n * 86_400_000;

// One entry per report type, each showcasing a different field combination.
// matchCount > 1 exercises the "N reports" badge.
export const MOCK_REPORTS: PublicReport[] = [
  // ── URL / Dodgy Link ─────────────────────────────────────────────────────────
  {
    id: "RPT-MOCK01",
    type: "url",
    content: "hxxps[://]myg0v[.]au-taxrefund[.]click/claim?token=aHR0cHM6Ly9leGFtcGxl",
    description: "Posed as ATO refund page. Asks for TFN, bank details, and Medicare number.",
    submittedAt: mins(4),
    scamUrl: "hxxps[://]myg0v[.]au-taxrefund[.]click/claim",
    scamPhone: "",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 14,
  },
  // URL + phone (QR scan led to phone callback scam)
  {
    id: "RPT-MOCK02",
    type: "qr",
    content: "hxxps[://]parking-fines[.]vic-gov[.]au-pay[.]xyz/ref/VIC-2024-88231",
    description: "QR code stuck on car windscreen, pretending to be a council parking fine.",
    submittedAt: hours(1),
    scamUrl: "hxxps[://]parking-fines[.]vic-gov[.]au-pay[.]xyz/ref/VIC-2024-88231",
    scamPhone: "+61 1300 XXX 492",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 3,
  },

  // ── SMS ──────────────────────────────────────────────────────────────────────
  // SMS with phone only
  {
    id: "RPT-MOCK03",
    type: "sms",
    content: "Hi it's Mum. I lost my phone, this is my new number. Can you transfer $200 urgently? I'll explain later.",
    description: "Classic 'Hi Mum' number swap scam. Came from a random mobile.",
    submittedAt: hours(2),
    scamUrl: "",
    scamPhone: "+61 4XX XXX 817",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 27,
  },
  // SMS with URL + phone
  {
    id: "RPT-MOCK04",
    type: "sms",
    content: "Australia Post: Your parcel is on hold due to an unpaid $3.50 fee. Pay now: hxxps[://]auspost-fee[.]cc/pay",
    description: "Delivery fee SMS. Link leads to card-skimming page.",
    submittedAt: hours(5),
    scamUrl: "hxxps[://]auspost-fee[.]cc/pay",
    scamPhone: "+61 4XX XXX 203",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 61,
  },
  // SMS with no identifiers (plain text scam)
  {
    id: "RPT-MOCK05",
    type: "sms",
    content: "CONGRATULATIONS! You've been selected for a $1,500 Woolworths gift card. Reply YES to claim.",
    description: "",
    submittedAt: days(1),
    scamUrl: "",
    scamPhone: "",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 1,
  },

  // ── Phone (Scam Number) ───────────────────────────────────────────────────────
  // Phone only
  {
    id: "RPT-MOCK06",
    type: "phone",
    content: "Robocall claiming to be the Australian Tax Office. Said my TFN had been 'suspended for fraud' and I needed to press 1 to speak to a federal agent.",
    description: "ATO robocall. Very aggressive, said arrest warrant issued.",
    submittedAt: hours(3),
    scamUrl: "",
    scamPhone: "+61 2 XXXX 5511",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 9,
  },
  // Phone + URL
  {
    id: "RPT-MOCK07",
    type: "phone",
    content: "Caller said they were from NBN Co and my connection would be cut. Directed me to hxxps[://]nbn-verify[.]net/id to 'confirm my account'.",
    description: "NBN disconnection scam. Human caller, convincing accent.",
    submittedAt: days(2),
    scamUrl: "hxxps[://]nbn-verify[.]net/id",
    scamPhone: "+61 3 XXXX 0042",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 5,
  },

  // ── Email / Phishing ─────────────────────────────────────────────────────────
  // Email: all email fields + all auth failures (matches MOCK_EMAIL_HEADERS.ALL_FLAGS)
  {
    id: "RPT-MOCK08",
    type: "email",
    content: [
      "Delivered-To: victim@gmail.com",
      "From: myGov <noreply@au-taxrefund.click>",
      "Reply-To: support@telecom-helpdesk.ru",
      "Return-Path: <bounce@eu-mailer.net>",
      "Subject: Urgent: Your myGov account has been locked",
      "Received-SPF: fail (spf.google.com: domain of au-taxrefund.click does not designate 104.21.88.12 as permitted sender) client-ip=104.21.88.12",
      "Authentication-Results: mx.google.com; spf=fail smtp.mailfrom=au-taxrefund.click; dkim=none; dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=au-taxrefund.click",
      "",
      "Dear Customer, we have detected unusual activity on your myGov account. Click the link below within 24 hours to avoid permanent suspension.",
      "hxxps[://]my-gov-au[.]help/unlock?uid=c29tZXVzZXI%3D",
    ].join("\n"),
    description: "myGov phishing. Sender domain was 'au-taxrefund[.]click', not mygov.gov.au. All auth checks failed.",
    submittedAt: hours(6),
    scamUrl: "hxxps[://]my-gov-au[.]help/unlock?uid=c29tZXVzZXI%3D",
    scamPhone: "",
    scamEmail: "noreply[at]au-taxrefund[.]click",
    scamReplyTo: "support[at]telecom-helpdesk[.]ru",
    emailAuth: "SPF fail · DMARC fail",
    matchCount: 38,
  },
  // Email: scamEmail + replyTo, SPF softfail, DKIM via unrelated SendGrid (matches MOCK_EMAIL_HEADERS.COMMBANK_PHISH)
  {
    id: "RPT-MOCK09",
    type: "email",
    content: [
      "From: CommonWealth Bank <secure-msg@commbank-alerts.info>",
      "Reply-To: helpdesk.commbank2024@gmail.com",
      "Return-Path: <bounce@commbank-alerts.info>",
      "Subject: Your CommBank account is temporarily restricted",
      "Received-SPF: softfail (domain of commbank-alerts.info does not strongly designate 198.51.100.22 as permitted sender) client-ip=198.51.100.22",
      "Authentication-Results: mx.google.com; spf=softfail smtp.mailfrom=commbank-alerts.info; dkim=pass header.d=sendgrid.net; dmarc=none",
      "",
      "Please log in to view your secure message. Your account may be compromised.",
      "Please verify your identity to restore access.",
    ].join("\n"),
    description: "CommBank impersonation. Reply-To goes to a Gmail address. DKIM signed by SendGrid, not CommBank.",
    submittedAt: days(1),
    scamUrl: "",
    scamPhone: "",
    scamEmail: "secure-msg[at]commbank-alerts[.]info",
    scamReplyTo: "helpdesk.commbank2024[at]gmail[.]com",
    emailAuth: "SPF softfail · DKIM pass (sendgrid[.]net) · DMARC none",
    matchCount: 12,
  },
  // Email: scamEmail only, all auth failures (matches MOCK_EMAIL_HEADERS.ATO_PHISH)
  {
    id: "RPT-MOCK10",
    type: "email",
    content: [
      "From: \"Australian Taxation Office\" <refunds@ato-secure.net>",
      "Reply-To: ato.refunds@protonmail.com",
      "Subject: Tax Refund Available — Action Required",
      "Received-SPF: fail (spf.protection.outlook.com: domain of ato-secure.net does not designate 203.0.113.5 as permitted sender) client-ip=203.0.113.5",
      "Authentication-Results: mx.google.com; spf=fail; dkim=fail; dmarc=fail (p=REJECT)",
      "",
      "Your Afterpay account is on hold. Verify your identity to restore full access.",
      "You have a pending refund of $1,842.00. Click here to claim.",
    ].join("\n"),
    description: "ATO impersonation. SPF, DKIM and DMARC all failed. Reply-To routes to ProtonMail.",
    submittedAt: days(3),
    scamUrl: "",
    scamPhone: "",
    scamEmail: "refunds[at]ato-secure[.]net",
    scamReplyTo: "ato.refunds[at]protonmail[.]com",
    emailAuth: "SPF fail · DKIM fail · DMARC fail",
    matchCount: 7,
  },
  // Email: URL + DKIM by unrelated tenant, DMARC none (matches MOCK_EMAIL_HEADERS.DKIM_UNRELATED_TENANT)
  {
    id: "RPT-MOCK11",
    type: "email",
    content: [
      "Return-Path: <linus@uppent.se>",
      "Authentication-Results: bimi.icloud.com; bimi=skipped reason=\"insufficient dmarc\"",
      "Authentication-Results: dmarc.icloud.com; dmarc=none header.from=uppent.se",
      "Authentication-Results: dkim-verifier.icloud.com; dkim=pass header.d=markona.onmicrosoft.com header.i=@markona.onmicrosoft.com",
      "Received-SPF: pass (spf.icloud.com: domain of linus@uppent.se designates 52.102.163.63 as permitted sender) client-ip=52.102.163.63",
      "ARC-Authentication-Results: i=1; mx.microsoft.com 1; spf=pass; dmarc=pass action=none header.from=uppent.se; dkim=pass header.d=uppent.se; arc=none",
      "From: myGov <linus@uppent.se>",
      "Subject: Your Medicare claim has been processed — collect your refund",
      "Accept-Language: sv-SE, en-US",
      "",
      "Click below to receive your $182.40 Medicare rebate directly to your bank account.",
      "hxxps[://]medicare-rebate[.]au-gov[.]site/collect",
    ].join("\n"),
    description: "myGov impersonation via Swedish domain. SPF passes but DMARC none; DKIM signed by unrelated onmicrosoft.com tenant.",
    submittedAt: days(4),
    scamUrl: "hxxps[://]medicare-rebate[.]au-gov[.]site/collect",
    scamPhone: "",
    scamEmail: "linus[at]uppent[.]se",
    scamReplyTo: "",
    emailAuth: "SPF pass · DKIM pass (markona[.]onmicrosoft[.]com) · DMARC none",
    matchCount: 19,
  },

  // ── Custom / Other ────────────────────────────────────────────────────────────
  // Custom with description only
  {
    id: "RPT-MOCK12",
    type: "custom",
    content: "Person came to my door claiming to be from Energy Australia doing a 'free energy audit'. Pressure-sold solar panels at inflated prices. Asked for bank account details on the spot.",
    description: "Door-to-door energy audit scam. Very pushy. Couldn't produce a business card.",
    submittedAt: days(2),
    scamUrl: "",
    scamPhone: "+61 4XX XXX 331",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 2,
  },
  // Custom with URL + description (romance/investment scam)
  {
    id: "RPT-MOCK13",
    type: "custom",
    content: "Met on dating app. After weeks of messaging, asked me to invest in crypto through their 'exclusive platform'. Site looked very professional.",
    description: "Pig butchering / romance investment scam. Lost $4k before I realised.",
    submittedAt: days(5),
    scamUrl: "hxxps[://]trade-vip[.]io/invest",
    scamPhone: "",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 1,
  },
  // Minimal report: only content, no identifiers, no description, matchCount = 1
  {
    id: "RPT-MOCK14",
    type: "sms",
    content: "Your licence is due for renewal. Visit service nsw to renew online.",
    description: "",
    submittedAt: days(6),
    scamUrl: "",
    scamPhone: "",
    scamEmail: "",
    scamReplyTo: "",
    emailAuth: "",
    matchCount: 1,
  },
];

export const MOCK_TOTAL = MOCK_REPORTS.length;
