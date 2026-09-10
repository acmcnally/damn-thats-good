/** Shopping Lists — route reserved now; the feature itself is a later (V2) story. */

import styles from './pages.module.css';

export function ShoppingListsPage() {
  return (
    <div className={styles.comingSoon}>
      <span className={styles.badge}>Coming soon</span>
      <h1>Shopping Lists</h1>
      <p>
        Manually-built lists, populated from an &ldquo;Add to shopping list&rdquo; action on a
        recipe &mdash; a V2 feature. The nav slot is reserved now.
      </p>
    </div>
  );
}
