/**
 * Profile — DAMN-32 placeholder. The real view/edit page and avatar handling are
 * DAMN-14. The identity line reuses `GET /api/me` (DAMN-1).
 */

import { useShellContext } from '../shell/shellContext';
import { useMe } from '../shell/useMe';
import styles from './pages.module.css';

export function ProfilePage() {
  const { getAccessToken } = useShellContext();
  const me = useMe(getAccessToken);

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
