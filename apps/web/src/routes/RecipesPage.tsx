/** Recipes — DAMN-32 placeholder. The list, cards, and entry flow arrive with DAMN-2. */

import styles from './pages.module.css';

export function RecipesPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Recipes</h1>
      <p className={styles.lead}>
        This is the Recipes page. The recipe list, cards, and entry flow arrive with DAMN-2.
      </p>
      <div className={styles.card}>
        <span className={styles.eyebrow}>Placeholder</span>
        <h2>Nothing here yet</h2>
        <p>DAMN-32 delivers the route and the frame; the feature UI lands later.</p>
      </div>
    </div>
  );
}
