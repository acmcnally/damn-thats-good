/**
 * SearchControl — inert; search behaviour (ranking, matching) is a later
 * feature. Two variants: `hero` (centered on `/`) and `bar` (in the top bar
 * everywhere else).
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
        // Inert — no handler, no results. Kept enabled so it reads as a real
        // affordance; the search feature wires it up later.
      />
    </div>
  );
}
