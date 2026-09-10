/** Shopping Lists — DAMN-32. Route reserved now; the feature is DAMN-11 (V2). */

import styles from './pages.module.css';

export function ShoppingListsPage() {
  return (
    <div className={styles.comingSoon}>
      <span className={styles.badge}>Coming soon</span>
      <h1>Shopping Lists</h1>
      <p>
        Manually-built lists, populated from an &ldquo;Add to shopping list&rdquo; action on a
        recipe &mdash; a V2 feature (DAMN-11). The nav slot is reserved now.
      </p>
    </div>
  );
}
