/**
 * Profile — placeholder. The identity line reuses the shared `GET /api/me` fetch.
 *
 * TODO: DAMN-14 — the real view/edit page.
 * TODO: DAMN-24 — real avatar handling (photo storage).
 */

import { useMe } from '../shell/MeProvider';
import styles from './pages.module.css';

export function ProfilePage() {
  const me = useMe();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Profile</h1>
      <p className={styles.lead}>
        This is the Profile page. The real view/edit page and avatar handling are coming soon.
      </p>
      <div className={styles.card}>
        <span className={styles.eyebrow}>Placeholder</span>
        <h2>{me.status === 'ok' ? `Signed in as ${me.data.email}` : 'Signed in'}</h2>
        <p>Default avatar until user photo storage lands.</p>
      </div>
    </div>
  );
}
