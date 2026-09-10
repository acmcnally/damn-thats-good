/**
 * Data — DAMN-32 placeholder. Reference data for the whole book (ingredients,
 * units) plus a bulk-export entry point. Management UI is a follow-on once the
 * DAMN-2 schema lands; export wires up with DAMN-23 (V4).
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
        <p>Management UI is a follow-on story, spun off once the DAMN-2 schema lands.</p>
      </div>
      <div className={styles.card}>
        <h2>Units of measure</h2>
        <p>Same &mdash; follow-on story after DAMN-2.</p>
      </div>
      <div className={styles.card}>
        <h2>Export</h2>
        <p>Full recipe-book export. Wires up when DAMN-23 ships (V4).</p>
        <button type="button" className={styles.exportButton} disabled>
          <DownloadIcon />
          Export book &mdash; coming soon
        </button>
      </div>
    </div>
  );
}
