/**
 * Home — the `/` index route inside the shell. Only ever mounts at `/`, so it
 * renders the centered hero (wordmark + search) unconditionally. Off `/`, the
 * search lives in the top bar instead (see `TopBar`).
 */

import { SearchControl } from '../shell/SearchControl';
import styles from './Home.module.css';

export function Home() {
  return (
    <div className={styles.hero}>
      <h1 className={styles.wordmark}>Damn That&rsquo;s Good</h1>
      <SearchControl variant="hero" />
    </div>
  );
}
