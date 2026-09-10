/**
 * Profile — DAMN-32 placeholder. The real view/edit page and avatar handling are
 * DAMN-14. The identity line reuses the shared `GET /api/me` (DAMN-1) fetch.
 */

import { useMe } from '../shell/MeProvider';
import styles from './pages.module.css';

export function ProfilePage() {
  const me = useMe();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Profile</h1>
      <p className={styles.lead}>
        This is the Profile page. The real view/edit page and avatar handling are DAMN-14.
      </p>
      <div className={styles.card}>
        <span className={styles.eyebrow}>Placeholder</span>
        <h2>{me.status === 'ok' ? `Signed in as ${me.data.email}` : 'Signed in'}</h2>
        <p>Default avatar until DAMN-24 adds photo storage.</p>
      </div>
    </div>
  );
}
