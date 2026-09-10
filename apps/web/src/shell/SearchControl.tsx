/**
 * SearchControl — DAMN-32. Inert: DAMN-6 owns search behaviour. Two variants:
 * `hero` (centered on `/`) and `bar` (in the top bar everywhere else).
 */

import { SearchIcon } from '../components/icons';
import styles from './SearchControl.module.css';

interface SearchControlProps {
  variant: 'hero' | 'bar';
}

export function SearchControl({ variant }: SearchControlProps) {
  return (
    <div className={`${styles.search} ${styles[variant]}`}>
      <SearchIcon className={styles.icon} />
      <input
        type="search"
        className={styles.input}
        placeholder="Search recipes"
        aria-label="Search recipes"
        // Inert for DAMN-32 — no handler, no results. Kept enabled so it reads as
        // a real affordance; DAMN-6 wires it up.
      />
    </div>
  );
}
