/**
 * A small "?" glyph that pops a help panel on click — Escape or an outside click
 * dismisses it, focus returns to the glyph on programmatic close. Self-contained
 * rather than built on the shell's `usePopover`/`PopoverGroup` (AvatarMenu,
 * SettingsMenu): that group only wraps the shell chrome (`AppShell` mounts it
 * around `TopBar`/`NavRail`, not `Outlet`), so a routed page like the recipe entry
 * form sits outside it and can't reach that context.
 */

import { type ReactNode, useEffect, useRef, useState } from 'react';

import styles from './HelpTooltip.module.css';
import { HelpCircleIcon } from './icons';

interface HelpTooltipProps {
  /** Accessible name for the glyph button, e.g. "Ingredients help". */
  label: string;
  children: ReactNode;
}

export function HelpTooltip({ label, children }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <span className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.glyph}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <HelpCircleIcon className={styles.glyphIcon} />
      </button>
      <div
        ref={popoverRef}
        className={styles.popover}
        role="group"
        aria-label={label}
        hidden={!isOpen}
      >
        {children}
      </div>
    </span>
  );
}
