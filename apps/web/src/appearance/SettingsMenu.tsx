/**
 * SettingsMenu — the gear popover in the top bar: a Light/Dark switch and a
 * palette picker. Every change repaints live (AppearanceProvider). Stays
 * open until an outside click or `Escape` (PopoverGroup), then focus returns to
 * the gear. This is the one genuinely functional piece of chrome in the shell.
 *
 * A disclosure holding a labelled group of controls — not a modal dialog (no
 * focus trap / `aria-modal`), so `role="group"`, not `role="dialog"`.
 */

import { GearIcon } from '../components/icons';
import { usePopover } from '../shell/PopoverGroup';
import { useAppearance } from './AppearanceProvider';
import styles from './SettingsMenu.module.css';
import { PALETTES } from './types';

const PALETTE_LABELS: Record<(typeof PALETTES)[number], string> = {
  terracotta: 'Terracotta',
  sage: 'Sage',
  plum: 'Plum',
};

export function SettingsMenu() {
  const { isOpen, toggle, triggerRef, popoverRef } = usePopover('settings');
  const { palette, effectiveMode, setMode, setPalette } = useAppearance();
  const isDark = effectiveMode === 'dark';

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.gear} ${isOpen ? styles.gearActive : ''}`}
        aria-label="Settings"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={toggle}
      >
        <GearIcon className={styles.gearIcon} />
      </button>

      <div
        ref={popoverRef}
        className={styles.popover}
        role="group"
        aria-label="Appearance"
        hidden={!isOpen}
      >
        <h3 className={styles.heading}>Appearance</h3>

        <div className={styles.modeRow}>
          <button
            type="button"
            className={`${styles.modeLabel} ${!isDark ? styles.modeLabelActive : ''}`}
            onClick={() => setMode('light')}
          >
            Light
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label="Dark mode"
            className={styles.switch}
            onClick={() => setMode(isDark ? 'light' : 'dark')}
          >
            <span className={styles.knob} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.modeLabel} ${isDark ? styles.modeLabelActive : ''}`}
            onClick={() => setMode('dark')}
          >
            Dark
          </button>
        </div>

        <div className={styles.themeRow}>
          <label htmlFor="palette-select" className={styles.themeLabel}>
            Theme
          </label>
          <select
            id="palette-select"
            className={styles.select}
            value={palette}
            onChange={(e) => setPalette(e.target.value as (typeof PALETTES)[number])}
          >
            {PALETTES.map((p) => (
              <option key={p} value={p}>
                {PALETTE_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
