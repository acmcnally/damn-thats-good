/**
 * NavRail — the persistent left rail: a Create button + menu (inert; recipe
 * entry and shopping lists are later features) and the primary nav. Active
 * route is highlighted via `NavLink`.
 */

import { NavLink } from 'react-router';

import { BookIcon, CartIcon, DatabaseIcon, PlusIcon } from '../components/icons';
import styles from './NavRail.module.css';
import { usePopover } from './PopoverGroup';

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  `${styles.navItem} ${isActive ? styles.navItemActive : ''}`;

export function NavRail() {
  const { isOpen, toggle, close, triggerRef, popoverRef } = usePopover('create');

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

        <div
          ref={popoverRef}
          className={styles.createMenu}
          role="group"
          aria-label="Create"
          hidden={!isOpen}
        >
          {/* Inert — the recipe-entry and shopping-list flows wire these later. */}
          <button type="button" className={styles.createMenuItem} onClick={close}>
            Recipe
          </button>
          <button type="button" className={styles.createMenuItem} onClick={close}>
            Shopping list
          </button>
        </div>
      </div>

      <NavLink to="/recipes" className={navItemClass}>
        <BookIcon className={styles.navIcon} />
        Recipes
      </NavLink>
      <NavLink to="/shopping-lists" className={navItemClass}>
        <CartIcon className={styles.navIcon} />
        Shopping Lists
      </NavLink>

      <div className={styles.divider} role="presentation" />

      <NavLink to="/data" className={navItemClass}>
        <DatabaseIcon className={styles.navIcon} />
        Data
      </NavLink>
    </nav>
  );
}
