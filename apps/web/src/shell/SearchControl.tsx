/**
 * SearchControl — two variants: `hero` (centered on `/`) and `bar` (in the top
 * bar everywhere else).
 *
 * TODO: DAMN-6 — inert placeholder; ranking / matching / results land there.
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
        // affordance. TODO: DAMN-6.
      />
    </div>
  );
}
