// Shared "one long-lived digest issue" plumbing for the weekly checkers.
//
// Three scripts publish a maintenance digest to a single labelled issue rather
// than opening a new one per run (52 issues a year reads as noise):
//
//   · check-sources.mjs             → 🔗 Threat-intel source check
//   · check-promotion-freshness.ts  → 📡 Radar / calendar promotion freshness
//   · dependabot-triage.mjs         → 🔒 Dependabot alert triage
//
// They had drifted into three near-identical copies of the same upsert. This is
// that logic, once.
//
// ── Close-on-clean ───────────────────────────────────────────────────────────
//
// A digest issue that stays open forever stops meaning "something needs doing",
// and an issue list you have learned to ignore is worse than no issue list. So
// callers pass `clean`, and a clean run closes the issue with a short comment
// instead of refreshing it with a green body. The next unclean run reopens the
// SAME issue, so one thread carries the whole history.
//
// The check's own liveness — previously the argument for keeping the issue open
// — is better served by the workflow run and its job summary, which every one of
// these callers already writes to unconditionally.
//
// Callers pass `clean` explicitly rather than having it inferred from the body:
// "nothing to report" is a judgement each checker makes differently, and
// dependabot-triage deliberately never closes (see its call site).

const GH_API = "https://api.github.com";

/**
 * Minimal GitHub REST wrapper. Throws on non-2xx with the status in the
 * message, which callers pattern-match (e.g. dependabot-triage's 401/403
 * access-denied detection), so keep the `-> <status>` shape.
 */
export async function ghFetch(path, token, init = {}, userAgent = "justcheckingmate-digest") {
  const res = await fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": userAgent,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Create the digest's label if it does not exist yet.
 *
 * Creating an issue with a label that does not exist fails the request outright,
 * so without this the digest could never be published on a fresh repo.
 * Idempotent: a 422 means it already exists.
 */
export async function ensureLabel(repo, token, name, color, description, deps = {}) {
  const fetchFn = deps.ghFetch ?? ghFetch;
  try {
    await fetchFn(`/repos/${repo}/labels`, token, {
      method: "POST",
      body: JSON.stringify({ name, color, description }),
    });
  } catch (err) {
    if (!/->\s*422\b/.test(String(err?.message ?? ""))) throw err;
  }
}

/**
 * Find this digest's issue, open or closed.
 *
 * Searching `state=all` is load-bearing for close-on-clean: once a clean run has
 * closed the issue, an `state=open` search would find nothing and the next
 * unclean run would open a duplicate — a fresh issue every time the checker
 * flipped state. Sorted newest-first so that if duplicates already exist from
 * before this change, we converge on the most recent one.
 */
async function findDigestIssue(repo, token, label, deps = {}) {
  const fetchFn = deps.ghFetch ?? ghFetch;
  const found = await fetchFn(
    `/repos/${repo}/issues?state=all&labels=${encodeURIComponent(label)}&sort=created&direction=desc&per_page=1`,
    token,
  );
  return Array.isArray(found) && found.length > 0 ? found[0] : null;
}

/**
 * Publish a digest to its single long-lived issue.
 *
 * @param {object}  opts
 * @param {string}  opts.repo        "owner/name"
 * @param {string}  opts.token       GitHub token with issues: write
 * @param {string}  opts.label       Digest's own label; identifies its issue
 * @param {string}  opts.title       Issue title, used only on first creation
 * @param {string}  opts.body        Rendered digest markdown
 * @param {boolean} opts.clean       True when the run found nothing to act on
 * @param {string[]} [opts.extraLabels]  Applied alongside `label` at creation
 * @param {string}  [opts.labelColor]
 * @param {string}  [opts.labelDescription]
 * @param {string}  [opts.closeComment]  Posted when a clean run closes the issue
 * @param {boolean} [opts.closeOnClean=true]  False keeps the issue open always
 * @returns {Promise<{number: number|null, action: string}>}
 *
 * `action` is one of: "created", "updated", "reopened", "closed",
 * "already-closed", "skipped-clean" (clean, and no issue has ever existed —
 * nothing to close, and opening one just to close it would be noise).
 */
export async function publishDigestIssue(opts, deps = {}) {
  const {
    repo,
    token,
    label,
    title,
    body,
    clean,
    extraLabels = [],
    labelColor = "1d76db",
    labelDescription = "",
    closeComment = "Resolved — this check is clean as of the latest run. Reopened automatically if it regresses.",
    closeOnClean = true,
  } = opts;

  const fetchFn = deps.ghFetch ?? ghFetch;
  const ensure = deps.ensureLabel ?? ensureLabel;

  const existing = await findDigestIssue(repo, token, label, deps);

  // ── Clean run ──────────────────────────────────────────────────────────────
  if (clean && closeOnClean) {
    if (!existing) return { number: null, action: "skipped-clean" };
    if (existing.state === "closed") return { number: existing.number, action: "already-closed" };

    // Refresh the body before closing so the thread's final state shows WHY it
    // closed, not the stale list of problems that have since been fixed.
    await fetchFn(`/repos/${repo}/issues/${existing.number}`, token, {
      method: "PATCH",
      body: JSON.stringify({ body, state: "closed", state_reason: "completed" }),
    });
    await fetchFn(`/repos/${repo}/issues/${existing.number}/comments`, token, {
      method: "POST",
      body: JSON.stringify({ body: closeComment }),
    });
    return { number: existing.number, action: "closed" };
  }

  // ── Something to report ────────────────────────────────────────────────────
  if (existing) {
    // Reopen if a previous clean run closed it. `state` is sent only when it
    // needs to change, so a maintainer-closed issue on a closeOnClean:false
    // digest is not silently reopened by a body refresh.
    const needsReopen = existing.state === "closed";
    await fetchFn(`/repos/${repo}/issues/${existing.number}`, token, {
      method: "PATCH",
      body: JSON.stringify(needsReopen ? { body, state: "open" } : { body }),
    });
    return { number: existing.number, action: needsReopen ? "reopened" : "updated" };
  }

  await ensure(repo, token, label, labelColor, labelDescription, deps);
  const created = await fetchFn(`/repos/${repo}/issues`, token, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: [label, ...extraLabels] }),
  });
  return { number: created.number, action: "created" };
}
