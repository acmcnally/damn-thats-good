/**
 * Tokenized tag chips + inline search-or-create control — no dropdowns/modals.
 * Suggestions come from `GET /api/tags`, book-scoped; `GET /tags` itself has no
 * server-side search (its own scope stays "return the full book-scoped list"),
 * so narrowing by the typed query happens here, client-side.
 */

import { useEffect, useRef, useState } from 'react';

import { listTags } from './api';
import styles from './TagsEditor.module.css';

interface TagsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  getAccessToken: () => Promise<string>;
}

export function TagsEditor({ tags, onChange, getAccessToken }: TagsEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Index into the rendered suggestion list (Create-option included), not the
  // filtered-suggestions array alone — -1 means nothing is keyboard-highlighted,
  // so Enter falls back to acting on the typed text.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdding) return;
    const handle = setTimeout(() => {
      listTags(getAccessToken, query)
        .then((rows) => setSuggestions(rows.map((r) => r.name)))
        .catch(() => setSuggestions([]));
    }, 150);
    return () => clearTimeout(handle);
  }, [isAdding, query, getAccessToken]);

  // A fresh query invalidates whatever was highlighted for the previous list.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag || tags.includes(tag)) {
      setQuery('');
      return;
    }
    onChange([...tags, tag]);
    setIsAdding(false);
    setQuery('');
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSuggestions = suggestions.filter(
    (s) => !tags.includes(s) && s.includes(normalizedQuery),
  );
  const exactMatch = normalizedQuery && filteredSuggestions.some((s) => s === normalizedQuery);

  // Flattened in on-screen order — the Create option, if shown, is a keyboard
  // stop just like the existing-tag suggestions below it.
  const listItems = [
    ...(query.trim() && !exactMatch ? [query.trim()] : []),
    ...filteredSuggestions.slice(0, 6),
  ];
  // Clamped rather than trusted as-is: the list can shrink out from under a
  // stale index when suggestions re-resolve after a debounce.
  const activeIndex = listItems.length > 0 ? Math.min(highlightedIndex, listItems.length - 1) : -1;

  return (
    <div className={styles.tagList}>
      {tags.map((tag) => (
        <span key={tag} className={styles.tagChip}>
          {tag}
          <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>
            ×
          </button>
        </span>
      ))}

      {isAdding ? (
        <div className={styles.tagInputWrap}>
          <input
            ref={inputRef}
            className={styles.tagInput}
            type="text"
            placeholder="Search or create…"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                if (listItems.length === 0) return;
                e.preventDefault();
                setHighlightedIndex(Math.min(activeIndex + 1, listItems.length - 1));
              } else if (e.key === 'ArrowUp') {
                if (listItems.length === 0) return;
                e.preventDefault();
                setHighlightedIndex(Math.max(activeIndex - 1, -1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIndex >= 0) addTag(listItems[activeIndex]!);
                else if (query.trim()) addTag(query);
              } else if (e.key === 'Escape') {
                setIsAdding(false);
                setQuery('');
              }
            }}
            role="combobox"
            aria-expanded={listItems.length > 0}
            aria-controls="tag-suggestions"
            aria-activedescendant={activeIndex >= 0 ? `tag-suggestion-${activeIndex}` : undefined}
            onBlur={() => {
              setTimeout(() => {
                if (document.activeElement !== inputRef.current) {
                  setIsAdding(false);
                  setQuery('');
                }
              }, 120);
            }}
          />
          {(query.trim() || filteredSuggestions.length > 0) && (
            <div className={styles.tagSuggestions} id="tag-suggestions" role="listbox">
              {query.trim() && !exactMatch && (
                <button
                  type="button"
                  id="tag-suggestion-0"
                  role="option"
                  aria-selected={activeIndex === 0}
                  className={`${styles.tagSuggestionCreate} ${activeIndex === 0 ? styles.tagSuggestionActive : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(query);
                  }}
                >
                  Create &quot;{query.trim()}&quot;
                </button>
              )}
              {filteredSuggestions.slice(0, 6).map((s, i) => {
                const index = (query.trim() && !exactMatch ? 1 : 0) + i;
                return (
                  <button
                    key={s}
                    type="button"
                    id={`tag-suggestion-${index}`}
                    role="option"
                    aria-selected={activeIndex === index}
                    className={`${styles.tagSuggestion} ${activeIndex === index ? styles.tagSuggestionActive : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addTag(s);
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className={styles.tagAddBtn}
          aria-label="Add tag"
          onClick={() => setIsAdding(true)}
        >
          +
        </button>
      )}
    </div>
  );
}
