/**
 * NavRail — the primary nav. Desktop: a persistent left rail with a Create
 * button + menu (inert) above the route list. Mobile (<=640px): a fixed
 * bottom tab bar with Create as an overlapping FAB. Which one mounts is
 * decided in JS (`useMediaQuery`), not CSS visibility — `usePopover`'s single
 * trigger ref can only serve one mounted button at a time, and jsdom can't
 * evaluate media queries, so a CSS-only swap would leave two "Primary"
 * landmarks in the tree at once (duplicate a11y surface, ambiguous test
 * queries). Active route is highlighted via `NavLink` in both variants.
 */

import { Fragment, useEffect } from 'react';
import { NavLink } from 'react-router';

import { BookIcon, CartIcon, DatabaseIcon, PlusIcon } from '../components/icons';
import { MOBILE_MEDIA_QUERY } from './breakpoints';
import styles from './NavRail.module.css';
import { usePopover } from './PopoverGroup';
import { useMediaQuery } from './useMediaQuery';

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  `${styles.navItem} ${isActive ? styles.navItemActive : ''}`;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `${styles.tab} ${isActive ? styles.tabActive : ''}`;

interface NavEntry {
  to: string;
  label: string;
  /** Shorter form for the mobile tab bar's tighter width; same as `label` when it already fits. */
  mobileLabel: string;
  Icon: typeof BookIcon;
}

const NAV_ITEMS: NavEntry[] = [
  { to: '/recipes', label: 'Recipes', mobileLabel: 'Recipes', Icon: BookIcon },
  { to: '/shopping-lists', label: 'Shopping Lists', mobileLabel: 'Shopping', Icon: CartIcon },
  { to: '/data', label: 'Data', mobileLabel: 'Data', Icon: DatabaseIcon },
];

export function NavRail() {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const { isOpen, toggle, close, triggerRef, popoverRef } = usePopover('create');

  // Only one of the two trigger buttons below is ever mounted (see the module
  // comment) — if the breakpoint flips while the Create popover is open, its
  // trigger unmounts out from under it. Close on every flip; `close()` is a
  // no-op when already closed, so this doesn't fight normal toggling.
  // Deliberately isMobile-only, not [isMobile, close]: `close`'s identity
  // changes on every open/close toggle (it closes over `isOpen`), so
  // depending on it here would re-fire this effect on a normal open and
  // immediately close what was just opened.
  useEffect(() => {
    close();
  }, [isMobile]);

  const createMenu = (className: string | undefined) => (
    <div ref={popoverRef} className={className} role="group" aria-label="Create" hidden={!isOpen}>
      {/* Inert. TODO: DAMN-2 (Recipe), DAMN-11 (Shopping list) — wire the create targets. */}
      <button type="button" className={styles.createMenuItem} onClick={close}>
        Recipe
      </button>
      <button type="button" className={styles.createMenuItem} onClick={close}>
        Shopping list
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <nav className={styles.tabbar} aria-label="Primary">
        {NAV_ITEMS.map(({ to, mobileLabel, Icon }) => (
          <NavLink key={to} to={to} className={tabClass}>
            <Icon className={styles.tabIcon} />
            {mobileLabel}
          </NavLink>
        ))}

        <div className={styles.fabWrap}>
          <button
            ref={triggerRef}
            type="button"
            className={styles.fab}
            aria-label="Create"
            aria-haspopup="true"
            aria-expanded={isOpen}
            onClick={toggle}
          >
            <PlusIcon className={styles.fabIcon} />
          </button>

          {createMenu(`${styles.createMenu} ${styles.createMenuMobile}`)}
        </div>
      </nav>
    );
  }

  return (
    <nav className={styles.rail} aria-label="Primary">
      <div className={styles.createWrap}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.create}
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={toggle}
        >
          <PlusIcon className={styles.createAffix} />
          <span>Create</span>
        </button>

        {createMenu(`${styles.createMenu} ${styles.createMenuDesktop}`)}
      </div>

      {NAV_ITEMS.map(({ to, label, Icon }, i) => (
        <Fragment key={to}>
          {i === 2 && <div className={styles.divider} role="presentation" />}
          <NavLink to={to} className={navItemClass}>
            <Icon className={styles.navIcon} />
            {label}
          </NavLink>
        </Fragment>
      ))}
    </nav>
  );
}
