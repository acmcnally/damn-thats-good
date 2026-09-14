/**
 * A registry so the shell's three popovers (settings, avatar menu, create menu)
 * coordinate: opening one closes the others, and an outside click or `Escape`
 * closes whichever is open. Three independent `usePopover()` instances can't do
 * this alone — the single `openId` state is the coordination.
 *
 * The provider mounts in `AppShell`, wrapping `TopBar` + `NavRail`.
 */

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type SetOpenId = (next: string | null | ((cur: string | null) => string | null)) => void;

interface PopoverGroupValue {
  openId: string | null;
  setOpenId: SetOpenId;
}

const PopoverGroupContext = createContext<PopoverGroupValue | null>(null);

export function PopoverGroup({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo<PopoverGroupValue>(() => ({ openId, setOpenId }), [openId]);
  return <PopoverGroupContext.Provider value={value}>{children}</PopoverGroupContext.Provider>;
}

export interface UsePopover {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  /** Attach to the button that opens the popover. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Attach to the popover container. */
  popoverRef: RefObject<HTMLDivElement | null>;
}

export function usePopover(id: string): UsePopover {
  const ctx = useContext(PopoverGroupContext);
  if (!ctx) {
    throw new Error('usePopover must be used within a <PopoverGroup>');
  }
  const { openId, setOpenId } = ctx;
  const isOpen = openId === id;

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // `close()` is the programmatic path (Escape, a menu-item click) — return
  // focus to the trigger so keyboard users don't get dropped onto <body>. The
  // outside-click path deliberately does not refocus (the user clicked
  // elsewhere).
  const close = useCallback(() => {
    if (!isOpen) return;
    setOpenId(null);
    triggerRef.current?.focus();
  }, [isOpen, setOpenId]);

  const toggle = useCallback(() => {
    setOpenId((cur) => (cur === id ? null : id));
  }, [id, setOpenId]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpenId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenId(null);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, setOpenId]);

  return { isOpen, toggle, close, triggerRef, popoverRef };
}
