"use client";

interface Props {
  value: string;
  className?: string;
}

// Renders a defanged string in a way that resists accidental or deliberate
// misuse:
//   · user-select:none  — mouse/touch text selection is blocked
//   · onCopy            — keyboard copy (Ctrl+A, Ctrl+C) is neutralised
//   · translate="no"    — prevents translation services auto-linking content
//   · data-nosnippet    — prevents search engines indexing the value
//   · No <a> wrapper    — never rendered as a hyperlink
export default function SafeDisplay({ value, className = "" }: Props) {
  function blockCopy(e: React.ClipboardEvent) {
    e.preventDefault();
  }

  return (
    <span
      className={`select-none ${className}`}
      onCopy={blockCopy}
      translate="no"
      data-nosnippet=""
    >
      {value}
    </span>
  );
}
