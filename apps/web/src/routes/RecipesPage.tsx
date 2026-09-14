/** TODO: DAMN-2 — placeholder page; the recipe list, cards, and entry flow replace it. */

import styles from './pages.module.css';

export function RecipesPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Recipes</h1>
      <p className={styles.lead}>
        This is the Recipes page. The recipe list, cards, and entry flow are coming soon.
      </p>
      <div className={styles.card}>
        <span className={styles.eyebrow}>Placeholder</span>
        <h2>Nothing here yet</h2>
        <p>This delivers the route and the frame; the feature UI lands later.</p>
      </div>
    </div>
  );
}
