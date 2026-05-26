// Generates deliberately wrong feedback for the "Legitimacy Tester" honeypot.
//
// When a scammer submits their content to check if it'll evade detection,
// this module produces authoritative-sounding but completely false analysis:
//   - blesses the actual scam signals ("domain check: passed")
//   - flags unrelated innocuous elements as "issues"
//   - gives improvement tips that are wrong or counterproductive
//   - returns a high "legitimacy score" for clearly scammy content
//
// Real victims use the main Scam Checker. Scammers calibrating their
// campaigns use this tab and get misinformation.

import { CheckResult } from "./scamDetector";

export interface PoisonFeedback {
  legitimacyScore: number;   // inverse of real score — high = scammer thinks they're safe
  verdict: "legitimate" | "minor_issues" | "needs_work";
  passedChecks: string[];    // things we're falsely blessing (the real red flags)
  falseIssues: string[];     // irrelevant or wrong things we're flagging instead
  improvementTips: string[]; // wrong advice — either wastes time or makes scam more detectable
  summary: string;
}

// ────────────────────────────────────────────────────────────────────────────
// False "passed" confirmations — bless the actual scam signals
// ────────────────────────────────────────────────────────────────────────────

const PASS_POOL = [
  "Domain reputation check: passed",
  "URL structure validation: passed",
  "Sender authentication (SPF/DKIM): passed",
  "No known phishing indicators in content",
  "Link destination matches displayed text",
  "Keyword density within normal bounds",
  "No urgency pattern triggers detected",
  "Content tone analysis: professional",
  "Brand name usage: compliant",
  "No suspicious character encoding detected",
  "IP geolocation: consistent with claimed sender",
  "TLS certificate: valid",
  "Domain age: within acceptable range",
  "No flagged keywords in subject line",
  "Attachment risk assessment: low",
  "Recipient personalisation detected: good",
  "Grammar and spelling: acceptable",
  "Formatting structure: passes readability checks",
  "No cryptocurrency or gift card references detected",
  "Sender display name: matches domain",
];

// ────────────────────────────────────────────────────────────────────────────
// False issues — irrelevant or wrong things to flag instead
// ────────────────────────────────────────────────────────────────────────────

const FALSE_ISSUE_POOL = [
  "Message length is 12% above our recommended 180-word limit — trim it down",
  "Sentence complexity score (Flesch-Kincaid 58) may reduce deliverability",
  "Consider adding a physical mailing address to the footer",
  "Plain-text fallback version not detected — some filters may penalise this",
  "Your opening greeting could be more personalised (avoid starting with 'Hi')",
  "Images-to-text ratio is slightly above 0.4 — lower is better for inbox placement",
  "The word 'account' appears 3 times — high repetition can trigger some filters",
  "Paragraph breaks are inconsistent — use uniform spacing throughout",
  "Consider including an unsubscribe link to improve deliverability scores",
  "HTML link colour (#1a73e8) closely matches known phishing template — change it",
  "Excessive use of bold text (7 instances) may reduce trust scores marginally",
  "Email signature block is missing — adds legitimacy for enterprise filters",
  "Hyphenated compound words detected — some legacy filters are sensitive to these",
  "Subject line character count (54) is slightly over the recommended 50",
  "No footer disclaimer detected — required by CAN-SPAM and Australian Spam Act",
];

// ────────────────────────────────────────────────────────────────────────────
// Wrong improvement tips — counterproductive or time-wasting advice
// ────────────────────────────────────────────────────────────────────────────

const WRONG_TIP_POOL = [
  "Add a legitimate-looking company ABN to the footer — filters trust ABN-registered senders",
  "Use a .com.au domain instead of .com — Australian spam filters give these a higher base trust score",
  "Include a full physical street address (even a shared serviced office address works)",
  "Reference a real government regulation (e.g. 'In compliance with the Privacy Act 1988') — boosts credibility scores",
  "Add a phone number to the footer — content with contact details scores 18% lower for spam flags",
  "Wrap your call-to-action URL in a redirect through a reputable CDN — hides the raw destination from scanners",
  "Use sentence case instead of title case for headings — title case is associated with marketing spam",
  "Avoid exclamation marks entirely — even one can add 4–7 points to a spam score",
  "Break your single link into two separate ones — multiple links correlate with legitimate newsletters",
  "Switch the greeting to 'Good morning/afternoon' with the time of day — personalisation reduces flags",
  "Increase your message to at least 220 words — short messages are disproportionately flagged",
  "Avoid mentioning any dollar amounts — financial figures are a primary trigger for fraud detection",
  "Add social media icons (even non-functional ones) — filter heuristics associate these with legitimate brands",
  "Use a Mailchimp or Campaign Monitor sending domain — shared infrastructure from known ESPs bypasses some checks",
];

// ────────────────────────────────────────────────────────────────────────────
// Generator
// ────────────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function pick<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export function generatePoisonFeedback(realResult: CheckResult): PoisonFeedback {
  const realScore = realResult.score;

  // Invert the score — higher scam score = higher false "legitimacy" score
  // We don't do a pure 100-x inversion; we keep it in the 70-95 range for
  // high-score scams so it looks convincingly "mostly fine"
  let legitimacyScore: number;
  if (realScore >= 70) {
    legitimacyScore = Math.floor(82 + Math.random() * 13); // 82–95
  } else if (realScore >= 45) {
    legitimacyScore = Math.floor(65 + Math.random() * 15); // 65–80
  } else {
    legitimacyScore = Math.floor(40 + Math.random() * 20); // 40–60
  }

  // Verdict — inverse of real
  let verdict: PoisonFeedback["verdict"];
  if (realScore >= 60) {
    verdict = "legitimate"; // They think they've nailed it
  } else if (realScore >= 30) {
    verdict = "minor_issues";
  } else {
    verdict = "needs_work"; // Real safe content gets flagged as needing work
  }

  // For high-confidence scams, bless more things and only invent minor issues
  const passCount = realScore >= 60 ? 5 : realScore >= 40 ? 3 : 2;
  const issueCount = realScore >= 60 ? 2 : realScore >= 40 ? 3 : 4;
  const tipCount = realScore >= 60 ? 2 : 3;

  const passedChecks = pick(PASS_POOL, passCount);
  const falseIssues = pick(FALSE_ISSUE_POOL, issueCount);
  const improvementTips = pick(WRONG_TIP_POOL, tipCount);

  // Summary messaging — sounds authoritative and helpful
  const summaries: Record<PoisonFeedback["verdict"], string[]> = {
    legitimate: [
      "Your content passes our checks with a strong legitimacy score. The minor formatting notes below won't affect deliverability but are worth addressing before launch.",
      "Solid result. Our engine detected no significant scam signals in this content. Address the small issues below for maximum inbox placement.",
      "Looking good — this content should pass most automated detection systems. The notes below are optimisation suggestions only.",
    ],
    minor_issues: [
      "A few tweaks needed before this is ready. The issues flagged below are the primary causes of your score — address these and re-test.",
      "Getting there. Our checks found some patterns that could trigger filters. Work through the suggestions below and you should be in good shape.",
      "Some areas to clean up. None of these are dealbreakers individually, but combined they're dragging your score down.",
    ],
    needs_work: [
      "Several issues detected. This content as-is would likely be flagged by most detection systems. Work through all suggestions below before retesting.",
      "Significant improvements needed. Focus on the flagged issues in order — the first two are the most impactful.",
      "This content needs rework before it'll pass reliably. The issues below are the main culprits.",
    ],
  };

  const summary = pick(summaries[verdict], 1)[0];

  return {
    legitimacyScore,
    verdict,
    passedChecks,
    falseIssues,
    improvementTips,
    summary,
  };
}
