import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Shared shell for every `.modal` overlay: portals to <body>, paints the
// backdrop, and wires Escape + backdrop-click to onClose.
//
// The portal is not optional. `.card` uses `backdrop-filter`, which makes a
// card BOTH the containing block for its `position: fixed` descendants AND a
// stacking context. A modal rendered inside a card therefore sizes itself
// against the card instead of the viewport, and any later sibling card paints
// on top of it. Rendering at <body> is the only reliable escape.
//
// Pass `busy` while a submit is in flight to make the dialog non-dismissable.
export default function ModalPortal({
  label,
  innerClassName = '',
  onClose,
  busy = false,
  children
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  if (typeof document === 'undefined') return null;

  const dismiss = () => {
    if (!busy) onClose();
  };

  return createPortal(
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={dismiss}
    >
      <div
        className={`modal__inner ${innerClassName}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Close"
          disabled={busy}
        >
          ×
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
