/**
 * Data — placeholder. Reference data for the whole book (ingredients, units)
 * plus a bulk-export entry point. The management UI is a follow-on once the
 * recipe schema lands; export wires up with the import/export feature (V4).
 */

import { DownloadIcon } from '../components/icons';
import styles from './pages.module.css';

export function DataPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Data</h1>
      <p className={styles.lead}>
        Reference data for the whole recipe book &mdash; ingredients and units of measure &mdash;
        plus a bulk export entry point.
      </p>

      <div className={styles.card}>
        <h2>Ingredients</h2>
        <p>Management UI is a follow-on story, once the recipe schema lands.</p>
      </div>
      <div className={styles.card}>
        <h2>Units of measure</h2>
        <p>Same &mdash; a follow-on story.</p>
      </div>
      <div className={styles.card}>
        <h2>Export</h2>
        <p>Full recipe-book export. Wires up with the import/export feature (V4).</p>
        <button type="button" className={styles.exportButton} disabled>
          <DownloadIcon />
          Export book &mdash; coming soon
        </button>
      </div>
    </div>
  );
}
