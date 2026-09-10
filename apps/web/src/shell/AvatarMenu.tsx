/**
 * AvatarMenu — DAMN-32. The avatar button (top-right) and its menu: an identity
 * line, Profile (→ `/profile`), and Sign out (→ AuthKit `signOut`). The default
 * avatar always renders; the identity line shows a skeleton while `GET /api/me`
 * is pending and renders nothing on error (no error UI in a menu).
 */

import { useNavigate } from 'react-router';

import { DefaultAvatar } from '../components/DefaultAvatar';
import { SignOutIcon, UserIcon } from '../components/icons';
import styles from './AvatarMenu.module.css';
import { usePopover } from './PopoverGroup';
import { useShellContext } from './shellContext';
import { useMe } from './useMe';

export function AvatarMenu() {
  const { isOpen, toggle, close, triggerRef, popoverRef } = usePopover('avatar');
  const { signOut, getAccessToken } = useShellContext();
  const navigate = useNavigate();
  const me = useMe(getAccessToken);

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.avatar}
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={toggle}
      >
        <DefaultAvatar className={styles.avatarIcon} />
      </button>

      <div
        ref={popoverRef}
        className={styles.menu}
        role="menu"
        aria-label="Account"
        hidden={!isOpen}
      >
        <p className={styles.identity}>
          {me.status === 'loading' && <span className={styles.skeleton} aria-hidden="true" />}
          {me.status === 'ok' && me.data.email}
        </p>

        <div className={styles.divider} />

        <button
          type="button"
          role="menuitem"
          className={styles.item}
          onClick={() => {
            close();
            void navigate('/profile');
          }}
        >
          <UserIcon className={styles.itemIcon} />
          Profile
        </button>
        <button
          type="button"
          role="menuitem"
          className={`${styles.item} ${styles.danger}`}
          onClick={() => {
            close();
            signOut();
          }}
        >
          <SignOutIcon className={styles.itemIcon} />
          Sign out
        </button>
      </div>
    </div>
  );
}
