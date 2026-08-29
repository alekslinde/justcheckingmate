// Share-target payload → check-box content.
//
// The PWA manifest registers a `share_target`, so "Just Checking, Mate" appears
// in the Android/iOS share sheet from Messages, WhatsApp, Mail, a browser — any
// app that can share text. The platform hands us the shared item as query
// params on a GET navigation, and this turns that into the string the check box
// should open with.
//
// PRIVACY: nothing here is sent anywhere. The payload lands in the client, is
// seeded into the existing check flow, and is analysed exactly like typed text
// — the same client-side-first path, with no share-specific logging. The URL is
// scrubbed from the address bar after reading (see ShareTargetSeed) so a shared
// scam does not sit in browser history or leak through a screenshot.
//
// Pure module: no React, no I/O. Shared by app/share/page.tsx (reads it) and
// its tests.

// The three params the Web Share Target spec defines for text sharing. Which
// one carries the payload is app-dependent and inconsistent in practice:
// browsers sharing a page tend to fill `url` (and put the page title in
// `title`), while messaging apps sharing a selection put everything in `text`
// — sometimes with the URL appended inside it.
export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

// Generous next to reportPrefill's 300: a shared SMS or email body is the
// point here, not an extracted identifier. Long enough for a full scam message,
// bounded so a crafted share can't stuff the textarea (or exceed what browsers
// will carry in a GET URL, which is the real ceiling anyway).
const MAX_SHARE_LEN = 5000;

function clean(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * Build the check-box content from a share-target payload.
 *
 * Order matters and is deliberate:
 *
 * - `text` is the richest field — a shared message body — so it leads.
 * - `url` is appended only when `text` does not already contain it. Chrome
 *   shares a page as `{title, url}`, but many apps share a selection as
 *   `{text}` with the link already inside; blindly concatenating would hand
 *   the detector the same URL twice.
 * - `title` is dropped when either of the others is present. It is the page or
 *   conversation name, not the suspicious content, and including it adds words
 *   the scoring would weigh as if the sender had written them. It is used only
 *   as a last resort, when it is the sole thing we were given.
 *
 * Returns "" when there is nothing usable, which the caller renders as the
 * ordinary empty check box rather than an error.
 */
export function buildShareContent(payload: SharePayload): string {
  const text = clean(payload.text);
  const url = clean(payload.url);
  const title = clean(payload.title);

  const parts: string[] = [];
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);

  // Only when we got nothing else — see the note above on why the title is not
  // mixed into real content.
  if (parts.length === 0 && title) parts.push(title);

  return parts.join("\n\n").slice(0, MAX_SHARE_LEN);
}

/** Read a share payload out of a URLSearchParams-like source. */
export function parseSharePayload(params: {
  get(name: string): string | null;
}): SharePayload {
  return {
    title: params.get("title") ?? undefined,
    text: params.get("text") ?? undefined,
    url: params.get("url") ?? undefined,
  };
}
