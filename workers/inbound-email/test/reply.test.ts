// Unit tests for the reply MIME builder. Uses the built-in node:test runner
// (Node ≥ 22 runs TypeScript natively) so the worker needs no test deps.
// Run with: npm test  (in workers/inbound-email)

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReplyMime } from "../src/reply.ts";

const REPLY = {
  subject: "Scam alert: the email you forwarded",
  text: "🚨 This looks like a scam.\n\n— Just Checking, Mate",
  html: '<p style="font-weight:bold">🚨 This looks like a scam.</p>',
};

const OPTS = {
  from: "check@justcheckingmate.com",
  to: "victim@gmail.com",
  messageId: "<orig-123@gmail.com>",
  references: "<thread-1@gmail.com>",
};

test("addresses the reply from the receiving address to the original sender", () => {
  const mime = buildReplyMime(REPLY, OPTS);
  // Addresses are literal; the display name and subject are RFC 2047
  // encoded-words because they carry non-ASCII (mimetext default).
  assert.match(mime, /^From:.*<check@justcheckingmate\.com>/m);
  assert.match(mime, /^To:.*<victim@gmail\.com>/m);
  assert.match(mime, /^Subject: =\?utf-8\?B\?/m);
  // The subject decodes back to the original text.
  const subjectB64 = mime.match(/^Subject: =\?utf-8\?B\?([^?]+)\?=/m)?.[1] ?? "";
  assert.equal(Buffer.from(subjectB64, "base64").toString("utf8"), REPLY.subject);
});

test("threads via In-Reply-To and a preserved+appended References chain", () => {
  const mime = buildReplyMime(REPLY, OPTS);
  assert.match(mime, /^In-Reply-To: <orig-123@gmail\.com>/m);
  // References keeps the prior chain and appends the message being replied to.
  assert.match(mime, /^References: <thread-1@gmail\.com> <orig-123@gmail\.com>/m);
});

test("marks the message as an automated reply (RFC 3834)", () => {
  const mime = buildReplyMime(REPLY, OPTS);
  assert.match(mime, /^Auto-Submitted: auto-replied/m);
});

test("includes both a plain-text and an HTML part", () => {
  const mime = buildReplyMime(REPLY, OPTS);
  assert.match(mime, /Content-Type: text\/plain/);
  assert.match(mime, /Content-Type: text\/html/);
  assert.match(mime, /multipart\/alternative/);
});

test("omits threading headers when there is no Message-ID", () => {
  const mime = buildReplyMime(REPLY, { from: OPTS.from, to: OPTS.to });
  assert.doesNotMatch(mime, /^In-Reply-To:/m);
  assert.doesNotMatch(mime, /^References:/m);
});

test("still produces a valid message body when given empty threading refs", () => {
  const mime = buildReplyMime(REPLY, { from: OPTS.from, to: OPTS.to, messageId: null, references: null });
  assert.match(mime, /^From:.*check@justcheckingmate\.com/m);
  assert.doesNotMatch(mime, /^References:/m);
});
