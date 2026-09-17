/**
 * A small confirm/cancel prompt built on the native `<dialog>` element —
 * `.showModal()` gives focus-trapping, Escape-to-close, and an inert
 * background for free; the element itself is ordinary DOM, styled with this
 * app's own tokens instead of the browser's native dialog chrome.
 */

import { useEffect, useId, useRef } from 'react';

import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action (e.g. delete). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // The `open` prop is the source of truth; `<dialog>`'s own open/closed state
  // is imperative (`showModal()`/`close()`), so this effect is what keeps the
  // two in sync in either direction.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={() => onCancel()} // Escape — let the dialog's own default close proceed, just sync state
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel(); // click landed on the backdrop, not the content
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.btnGhost} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`${styles.btnPrimary} ${destructive ? styles.destructive : ''}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
