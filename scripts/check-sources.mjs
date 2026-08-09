// Reachability checker for the threat-intel source registry.
//
// Reads docs/threat-intel/sources.yml, requests every source URL, and reports
// what has rotted. Link rot is the quiet failure mode of the roadmap archive:
// when a citation 404s, the evidence for a hardcoded score in lib/ is gone and
// only the magic number is left.
//
// This checks REACHABILITY ONLY — whether the page still exists. It does not
// judge freshness or read content; that is the research job, not this one.
//
// Safety: entries under `indicators:` are scam domains quoted as evidence. They
// are never fetched. If one appears in a source tier the run FAILS rather than
// skipping it quietly, because that is a mistake that must not be merged.
//
// Dependency-free by design — it parses the registry's own fixed shape rather
// than pulling a YAML library into CI. See parseRegistry() for the constraints
// that implies.
//
// Usage:
//   node scripts/check-sources.mjs              # human-readable report
//   node scripts/check-sources.mjs --json       # machine-readable
//   node scripts/check-sources.mjs --markdown   # issue-body format
//   node scripts/check-sources.mjs --issue      # refresh the digest issue
//   node scripts/check-sources.mjs --validate   # parse + validate, no network
//
// Exit codes: 0 all reachable · 1 rot found · 2 registry invalid.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = resolve(HERE, "../docs/threat-intel/sources.yml");

// 30s, not 15s: several .gov.au sites (acma, cyber) routinely take 15-25s to
// answer a cold request. A shorter budget reports them as TIMEOUT every week,
// which trains you to ignore the report — the one failure mode that makes this
// whole job worthless.
const TIMEOUT_MS = 30_000;
const CONCURRENCY = 6;   // polite: several are small gov / single-operator sites
const RETRIES = 1;

// Identifies the bot and points operators at the repo. Some WAFs reject unknown
// agents outright, which is itself a checkable outcome (BLOCKED, not DEAD).
const USER_AGENT =
  "justcheckingmate-source-check/1.0 (+https://github.com/alekslinde/justcheckingmate; abuse-reporting tool)";

// Several sites (acma.gov.au and cyber.gov.au among them) sit behind a WAF that
// blackholes unrecognised agents — the connection hangs until it aborts rather
// than returning 403. Indistinguishable from a dead host on the first attempt.
//
// So a failure is retried once with a browser UA purely to TELL THE TWO APART.
// If the browser UA succeeds the source is reported BLOCKED — reachable, but
// unverifiable by this job — never OK. We do not launder the result: a human
// still has to look. Masking it as OK would let real rot hide behind a WAF.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Registry parsing
//
// Deliberately not a general YAML parser. It handles exactly the shapes
// sources.yml uses: nested maps, `- key: value` list items, quoted scalars and
// `>-` folded blocks. Anything outside that is a parse error rather than a
// silent misread — a checker that quietly skips half the registry is worse than
// one that refuses to run.
// ---------------------------------------------------------------------------

function stripComment(line) {
  // Only strips a full-line comment. Inline `#` is left alone: URLs contain
  // fragments, and no value in the registry needs a trailing comment.
  return line.trimStart().startsWith("#") ? "" : line;
}

function unquote(v) {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length > 1) ||
    (t.startsWith("'") && t.endsWith("'") && t.length > 1)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function parseRegistry(text) {
  const lines = text.split("\n").map(stripComment);

  const out = { tiers: {}, brands: [], indicators: [], version: null, updated: null };

  let section = null;       // "tiers" | "brands" | "indicators"
  let tierKey = null;
  let current = null;       // entry being built
  let folding = null;       // { key, indent, parts } while inside a `>-` block

  const flush = () => {
    if (!current) return;
    if (section === "tiers" && tierKey) (out.tiers[tierKey] ||= []).push(current);
    else if (section === "brands") out.brands.push(current);
    current = null;
  };

  for (const raw of lines) {
    if (!raw.trim()) {
      // A blank line inside a folded block is a paragraph break, not an end.
      if (folding) folding.parts.push("");
      continue;
    }

    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    // Continuation of a folded scalar: anything indented past its introducer.
    if (folding && indent > folding.indent) {
      folding.parts.push(line);
      continue;
    }
    if (folding) {
      current[folding.key] = folding.parts.join(" ").replace(/\s+/g, " ").trim();
      folding = null;
    }

    // Top-level keys.
    if (indent === 0) {
      flush();
      const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!m) continue;
      const [, key, val] = m;
      if (key === "tiers" || key === "brands" || key === "indicators") {
        section = key;
        tierKey = null;
      } else if (key === "version" || key === "updated") {
        out[key] = unquote(val);
        section = null;
      } else {
        section = null;
      }
      continue;
    }

    // Tier number key, e.g. "1:".
    if (section === "tiers" && /^\d+:$/.test(line)) {
      flush();
      tierKey = line.slice(0, -1);
      continue;
    }

    // Bare list item — only `indicators:` uses this form.
    if (line.startsWith("- ") && !line.slice(2).includes(": ") && !line.slice(2).endsWith(":")) {
      if (section === "indicators") out.indicators.push(unquote(line.slice(2)));
      continue;
    }

    // Start of a mapping list item: "- key: value".
    if (line.startsWith("- ")) {
      flush();
      current = {};
      const body = line.slice(2);
      const m = body.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (m) {
        const [, key, val] = m;
        if (val === ">-" || val === ">" || val === "|" || val === "|-") {
          folding = { key, indent, parts: [] };
        } else {
          current[key] = unquote(val);
        }
      }
      continue;
    }

    // Subsequent key on the current entry.
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (m && current) {
      const [, key, val] = m;
      if (val === ">-" || val === ">" || val === "|" || val === "|-") {
        folding = { key, indent, parts: [] };
      } else {
        current[key] = unquote(val);
      }
    }
  }

  if (folding && current) {
    current[folding.key] = folding.parts.join(" ").replace(/\s+/g, " ").trim();
  }
  flush();

  return out;
}

// ---------------------------------------------------------------------------
// Validation — runs before any network access.
// ---------------------------------------------------------------------------

function validate(reg) {
  const errors = [];
  const indicators = new Set(reg.indicators.map((d) => d.toLowerCase()));

  const all = [
    ...Object.entries(reg.tiers).flatMap(([t, es]) => es.map((e) => ({ ...e, tier: t }))),
    ...reg.brands.map((e) => ({ ...e, tier: "brands" })),
  ];

  if (all.length === 0) errors.push("registry parsed to zero sources — parser or file is broken");

  const seen = new Map();
  for (const e of all) {
    if (!e.domain) {
      errors.push(`entry in tier ${e.tier} has no domain`);
      continue;
    }
    if (!e.url) {
      errors.push(`${e.domain} (tier ${e.tier}) has no url`);
      continue;
    }
    if (!/^https:\/\//.test(e.url)) {
      errors.push(`${e.domain} url must be https: ${e.url}`);
    }

    // The quarantine assertion. A scam domain promoted into a source tier is a
    // merge-blocking error, not a warning.
    const host = (() => {
      try { return new URL(e.url).hostname.toLowerCase().replace(/^www\./, ""); }
      catch { return null; }
    })();
    if (!host) {
      errors.push(`${e.domain} has an unparseable url: ${e.url}`);
    } else if (indicators.has(host) || indicators.has(e.domain.toLowerCase())) {
      errors.push(
        `SAFETY: ${e.domain} is listed under indicators: but appears in tier ${e.tier}. ` +
        `Indicators are scam infrastructure and must never be fetched.`,
      );
    }

    const prev = seen.get(e.domain);
    if (prev) errors.push(`${e.domain} appears in both tier ${prev} and tier ${e.tier}`);
    else seen.set(e.domain, e.tier);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------------

async function probe(url, method, signal, ua = USER_AGENT) {
  return fetch(url, {
    method,
    redirect: "follow",
    signal,
    headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,*/*" },
  });
}

// Distinguishes "WAF is refusing our bot" from "host is genuinely gone".
// Returns true only if the site answers a browser-shaped request.
async function respondsToBrowserUa(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await probe(url, "GET", controller.signal, BROWSER_UA);
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function checkOne(entry) {
  const result = { domain: entry.domain, url: entry.url, tier: entry.tier, name: entry.name };

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // HEAD first (cheap); many sites answer 403/405 to it, so fall back to a
      // GET before concluding anything is wrong.
      let res = await probe(entry.url, "HEAD", controller.signal);
      if (res.status === 405 || res.status === 403 || res.status === 501) {
        res = await probe(entry.url, "GET", controller.signal);
      }
      clearTimeout(timer);

      result.status = res.status;
      result.finalUrl = res.url;

      const from = new URL(entry.url);
      const to = new URL(res.url);
      // Redirect to a bare homepage is the classic sign of a reorganised site
      // that has thrown away the deep link — reachable, but the citation is gone.
      const landedOnRoot = to.pathname === "/" && from.pathname !== "/";
      const changedHost = to.hostname.replace(/^www\./, "") !== from.hostname.replace(/^www\./, "");

      if (res.status === 404 || res.status === 410) result.state = "DEAD";
      else if (res.status === 403 || res.status === 429) {
        // A 403 to our UA is usually a WAF, but it can also be a page pulled
        // behind auth. Confirm the URL still serves someone — unless the entry
        // is marked `expect: blocked`, meaning its edge protection refuses every
        // automated request and no probe can distinguish the two. Calling those
        // DEAD would accuse a live source of rotting.
        if (entry.expect === "blocked") {
          result.state = "BLOCKED";
          result.error = `HTTP ${res.status} (expected — bot protection)`;
        } else {
          result.state = (await respondsToBrowserUa(entry.url)) ? "BLOCKED" : "DEAD";
          if (result.state === "DEAD") result.error = `HTTP ${res.status} to any agent`;
        }
      }
      else if (res.status >= 500) result.state = "SERVER_ERROR";
      else if (!res.ok) result.state = "DEAD";
      else if (landedOnRoot || changedHost) result.state = "REDIRECTED";
      else result.state = "OK";

      return result;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === RETRIES) {
        // Before calling it dead, check whether it is only our UA being refused.
        if (await respondsToBrowserUa(entry.url)) {
          result.state = "BLOCKED";
          result.error = "blocks automated agents (responds to a browser)";
          return result;
        }
        result.state = err.name === "AbortError" ? "TIMEOUT" : "UNREACHABLE";
        result.error = err.message;
        return result;
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return result;
}

async function runPool(entries, limit) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, entries.length) }, async () => {
    while (i < entries.length) {
      const entry = entries[i++];
      results.push(await checkOne(entry));
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

// BLOCKED is not rot — a WAF rejecting a bot says nothing about whether the
// citation still resolves for a human. Surfaced, never failed on.
const PROBLEM = new Set(["DEAD", "SERVER_ERROR", "TIMEOUT", "UNREACHABLE", "REDIRECTED"]);
const FAIL = new Set(["DEAD", "UNREACHABLE", "TIMEOUT"]);

function sortKey(r) {
  const order = { DEAD: 0, UNREACHABLE: 1, TIMEOUT: 2, SERVER_ERROR: 3, REDIRECTED: 4, BLOCKED: 5, OK: 6 };
  const tier = r.tier === "brands" ? 9 : Number(r.tier);
  return [order[r.state] ?? 9, tier];
}

function markdown(results, reg, retiredCount = 0) {
  const problems = results.filter((r) => PROBLEM.has(r.state)).sort((a, b) => {
    const [ao, at] = sortKey(a); const [bo, bt] = sortKey(b);
    return ao - bo || at - bt;
  });
  const blocked = results.filter((r) => r.state === "BLOCKED");
  const ok = results.filter((r) => r.state === "OK").length;

  const out = [];
  out.push("## Threat-intel source check");
  out.push("");
  const retiredNote = retiredCount ? ` · ${retiredCount} retired (not checked)` : "";
  out.push(`Registry \`v${reg.version}\`, updated ${reg.updated} · ${results.length} sources checked · **${ok} OK**, **${problems.length} need attention**, ${blocked.length} blocked-to-bots${retiredNote}.`);
  out.push("");

  if (problems.length === 0) {
    out.push("✅ Every source URL still resolves. No action needed.");
  } else {
    out.push("| State | Tier | Source | URL | Detail |");
    out.push("|---|---|---|---|---|");
    for (const r of problems) {
      const detail =
        r.state === "REDIRECTED" ? `→ ${r.finalUrl}` :
        r.error ? r.error :
        r.status ? `HTTP ${r.status}` : "";
      out.push(`| ${r.state} | ${r.tier} | ${r.name || r.domain} | ${r.url} | ${detail} |`);
    }
    out.push("");
    if (problems.some((r) => FAIL.has(r.state))) {
      out.push("**DEAD / UNREACHABLE** — the citation is gone. Find the replacement URL or mark the source retired; any roadmap claim resting on it has lost its evidence.");
      out.push("");
    }
    if (problems.some((r) => r.state === "REDIRECTED")) {
      out.push("**REDIRECTED** — resolves, but landed on a homepage or a different host. Usually a site reorganisation that dropped the deep link. Update the registry URL.");
      out.push("");
    }
  }

  if (blocked.length) {
    out.push("");
    out.push(`<details><summary>${blocked.length} blocked to automated requests (not rot)</summary>`);
    out.push("");
    for (const r of blocked) {
      const why = r.status ? `HTTP ${r.status}` : r.error || "no response to our agent";
      out.push(`- ${r.name || r.domain} — ${why} — ${r.url}`);
    }
    out.push("");
    out.push("</details>");
  }

  out.push("");
  out.push("<sub>Reachability only — this does not check whether a source has published anything new. Indicator domains are never fetched.</sub>");
  return out.join("\n");
}

function human(results, reg, retiredCount = 0) {
  const by = (s) => results.filter((r) => r.state === s);
  const lines = [];
  lines.push(`\nSource registry v${reg.version} (updated ${reg.updated})`);
  lines.push(`${results.length} sources checked${retiredCount ? `, ${retiredCount} retired (skipped)` : ""}\n`);
  for (const state of ["DEAD", "UNREACHABLE", "TIMEOUT", "SERVER_ERROR", "REDIRECTED", "BLOCKED"]) {
    const rs = by(state);
    if (!rs.length) continue;
    lines.push(`${state} (${rs.length}):`);
    for (const r of rs) {
      const extra = r.state === "REDIRECTED" ? ` -> ${r.finalUrl}` : r.error ? ` (${r.error})` : r.status ? ` (HTTP ${r.status})` : "";
      lines.push(`  [tier ${r.tier}] ${r.domain}${extra}`);
    }
    lines.push("");
  }
  lines.push(`OK: ${by("OK").length}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------

// GitHub API helper, matching the shape used by dependabot-triage.mjs.
async function ghFetch(path, token, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// One long-lived issue refreshed in place, same convention as the deps digest —
// a new issue every week would be 52 a year and read as noise.
async function upsertDigestIssue(repo, token, body) {
  const label = "source-check";
  const title = "🔗 Threat-intel source check";
  const existing = await ghFetch(`/repos/${repo}/issues?state=open&labels=${label}&per_page=1`, token);
  if (Array.isArray(existing) && existing.length > 0) {
    await ghFetch(`/repos/${repo}/issues/${existing[0].number}`, token, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    return existing[0].number;
  }
  const created = await ghFetch(`/repos/${repo}/issues`, token, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: [label, "threat-intel"] }),
  });
  return created.number;
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const asMarkdown = args.includes("--markdown");
  const asIssue = args.includes("--issue");
  const validateOnly = args.includes("--validate");

  const text = await readFile(REGISTRY, "utf8");
  const reg = parseRegistry(text);

  const errors = validate(reg);
  if (errors.length) {
    console.error("Registry is invalid:\n");
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(2);
  }

  if (validateOnly) {
    const count =
      Object.values(reg.tiers).reduce((n, es) => n + es.length, 0) + reg.brands.length;
    console.log(`Registry v${reg.version} valid — ${count} sources, ${reg.indicators.length} quarantined indicators.`);
    process.exit(0);
  }

  const entries = [
    ...Object.entries(reg.tiers).flatMap(([t, es]) => es.map((e) => ({ ...e, tier: t }))),
    ...reg.brands.map((e) => ({ ...e, tier: "brands" })),
  ];

  // Belt and braces: the validator already fails on overlap, but never let an
  // indicator reach the network layer even if validation is ever loosened.
  const indicators = new Set(reg.indicators.map((d) => d.toLowerCase()));
  const safe = entries.filter((e) => {
    try { return !indicators.has(new URL(e.url).hostname.toLowerCase().replace(/^www\./, "")); }
    catch { return false; }
  });

  // `retired: true` marks a source that is known-gone and kept only as a record
  // (see gotaxaustralia.com). Re-checking it every week would report the same
  // known failure forever.
  const live = safe.filter((e) => e.retired !== "true" && e.retired !== true);
  const retiredCount = safe.length - live.length;

  const results = await runPool(live, CONCURRENCY);

  if (asJson) console.log(JSON.stringify({ registry: { version: reg.version, updated: reg.updated }, retired: retiredCount, results }, null, 2));
  else if (asMarkdown) console.log(markdown(results, reg, retiredCount));
  else console.log(human(results, reg, retiredCount));

  if (asIssue) {
    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) {
      console.error("--issue needs GITHUB_REPOSITORY and GITHUB_TOKEN");
      process.exit(2);
    }
    const n = await upsertDigestIssue(repo, token, markdown(results, reg, retiredCount));
    console.error(`Digest issue #${n} refreshed.`);
  }

  process.exit(results.some((r) => FAIL.has(r.state)) ? 1 : 0);
}

// Only run when invoked directly, so the parser and validator can be imported
// by tests without firing off a hundred network requests.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("check-sources failed:", err);
    process.exit(2);
  });
}

export { parseRegistry, validate };
