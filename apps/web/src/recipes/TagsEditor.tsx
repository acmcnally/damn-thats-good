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
              if (e.key === 'Enter') {
                e.preventDefault();
                if (query.trim()) addTag(query);
              } else if (e.key === 'Escape') {
                setIsAdding(false);
                setQuery('');
              }
            }}
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
            <div className={styles.tagSuggestions}>
              {query.trim() && !exactMatch && (
                <button
                  type="button"
                  className={styles.tagSuggestionCreate}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(query);
                  }}
                >
                  Create &quot;{query.trim()}&quot;
                </button>
              )}
              {filteredSuggestions.slice(0, 6).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.tagSuggestion}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                >
                  {s}
                </button>
              ))}
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
