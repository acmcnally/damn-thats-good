/**
 * AppShell — DAMN-32. The persistent authenticated frame: a layout route (not a
 * per-page wrapper), so it mounts once and survives every navigation. Grid of
 * top bar + left nav rail + routed content. Wraps the interactive chrome in a
 * single `<PopoverGroup>` so the settings, avatar, and create popovers
 * coordinate.
 */

import { Outlet } from 'react-router';

import styles from './AppShell.module.css';
import { NavRail } from './NavRail';
import { PopoverGroup } from './PopoverGroup';
import { useShellContext } from './shellContext';
import { TopBar } from './TopBar';

export function AppShell() {
  const shell = useShellContext();

  return (
    <div className={styles.shell}>
      <PopoverGroup>
        <TopBar />
        <NavRail />
      </PopoverGroup>
      <main className={styles.main}>
        <Outlet context={shell} />
      </main>
    </div>
  );
}
