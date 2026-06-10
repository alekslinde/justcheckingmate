import type { ReactNode } from "react";

// Renders a translated string with **bold** markers as <strong> elements, so
// message dictionaries can stay plain JSON while keeping emphasis. Anything
// outside well-formed ** pairs renders as-is.
export function bold(text: string): ReactNode {
  const parts = text.split("**");
  if (parts.length < 3) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-gray-100">{part}</strong>
    ) : (
      part
    ),
  );
}
