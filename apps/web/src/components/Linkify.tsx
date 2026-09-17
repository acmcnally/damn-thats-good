import type { ReactNode } from 'react';

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
// Trailing punctuation is more often sentence structure than part of the URL
// ("see grandma-recipes.com/chili." / "(from grandma-recipes.com/chili)") — strip it
// off the link and render it as plain text after.
const TRAILING_PUNCTUATION = /[.,!?;:)\]]+$/;

/** Renders `text` with any `http(s)://` URLs turned into clickable links. Plain React
 * element construction, never `dangerouslySetInnerHTML` — safe for arbitrary user text. */
export function Linkify({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const trailing = rawUrl.match(TRAILING_PUNCTUATION)?.[0] ?? '';
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <a key={key++} href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>,
    );
    if (trailing) parts.push(trailing);
    lastIndex = match.index + rawUrl.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return <>{parts}</>;
}
