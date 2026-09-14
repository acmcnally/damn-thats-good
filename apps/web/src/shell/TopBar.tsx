/**
 * TopBar — route-aware search slot + the account cluster (settings gear,
 * avatar). Search placement is a pure function of the path: the bar shows its
 * search only off `/` (on `/`, `Home` renders the centered hero instead). No
 * shared state — `Home` mounts only at `/`, so exactly one search renders.
 */

import { useLocation } from 'react-router';

import { SettingsMenu } from '../appearance/SettingsMenu';
import { AvatarMenu } from './AvatarMenu';
import { SearchControl } from './SearchControl';
import styles from './TopBar.module.css';

export function TopBar() {
  const isHome = useLocation().pathname === '/';

  return (
    <header className={styles.topBar}>
      {isHome ? (
        <div className={styles.spacer} />
      ) : (
        <div className={styles.searchSlot}>
          <SearchControl variant="bar" />
        </div>
      )}

      <div className={styles.account}>
        <SettingsMenu />
        <AvatarMenu />
      </div>
    </header>
  );
}
