"use client";

import type { ReactNode } from "react";

// A card-styled disclosure: a heading you click to reveal its content.
//
// The Learn page's answer to the same wall-of-text problem the threat radar and
// scam calendar already solved — reference and secondary material collapses
// behind a summary instead of rendering in full, so the page opens on what
// matters rather than everything at once.
//
// Native <details>/<summary> rather than state: it brings keyboard support, the
// right screen-reader semantics, and find-in-page for free (a browser opens a
// closed <details> to reveal a Ctrl+F match), none of which a div-and-state
// version gets without work. The chevron is the same inline SVG ThreatCard and
// SeasonRow draw — a downward V at text-gray-200, stroke 2.5, rotated 180° on
// open — so every disclosure in the app reads as the same control.
//
// The id lands on the <details> itself so a table-of-contents link can target
// it; LearnContent additionally opens the matching section on navigation, since
// scrolling to a collapsed header would otherwise hide the very content the link
// promised.
export default function Collapsible({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id?: string;
  /** The clickable heading. Rendered as an <h2> to keep the document outline. */
  title: string;
  /** Open on first paint. Reserve for content that is read, not consulted. */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group scroll-mt-20 bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl"
    >
      {/* marker:hidden + the webkit rule drop the platform triangle so the SVG
          chevron can sit on the right where the layout wants it. */}
      <summary className="flex items-center justify-between gap-3 p-6 cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden rounded-2xl hover:bg-gray-800/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
        <h2 className="font-bold text-emerald-400 text-sm uppercase tracking-wider">{title}</h2>
        <svg
          className="shrink-0 w-5 h-5 text-gray-200 transition-transform duration-200 group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      {/* Padding lives here, not on <details>: a closed <details> renders only
          its summary, so the body's padding never affects the collapsed height. */}
      <div className="px-6 pb-6">{children}</div>
    </details>
  );
}
