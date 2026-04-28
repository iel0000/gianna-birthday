import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ConfirmContext = createContext(null);

// Themed replacement for window.confirm() / window.alert(). Wraps the app
// at the root and exposes:
//
//   const { confirm, alert } = useConfirm();
//   const ok = await confirm({ title, message, confirmLabel, danger });
//   if (!ok) return;
//
//   await alert({ title, message }); // single OK button
//
// Both return a Promise — the dialog stays open until the user clicks,
// presses Enter (confirm) or Escape (cancel), or clicks the backdrop.
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        kind: 'confirm',
        title: opts.title || 'Are you sure?',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Yes, do it',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: !!opts.danger,
        icon: opts.icon || (opts.danger ? '⚠️' : '💜'),
        resolve
      });
    });
  }, []);

  const alert = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        kind: 'alert',
        title: opts.title || 'Heads up',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Got it',
        cancelLabel: null,
        danger: !!opts.danger,
        icon: opts.icon || (opts.danger ? '⚠️' : '✨'),
        resolve
      });
    });
  }, []);

  const close = (value) => {
    if (!state) return;
    state.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {state &&
        typeof document !== 'undefined' &&
        createPortal(<Dialog state={state} close={close} />, document.body)}
    </ConfirmContext.Provider>
  );
}

function Dialog({ state, close }) {
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    confirmBtnRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCancel = () => close(false);
  const onConfirm = () => close(true);
  const isAlert = state.kind === 'alert';

  return (
    <div
      className="modal confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-label={state.title}
      onClick={onCancel}
    >
      <div
        className={`modal__inner confirm-dialog ${state.danger ? 'confirm-dialog--danger' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog__icon" aria-hidden="true">
          {state.icon}
        </div>
        <h3 className="confirm-dialog__title">{state.title}</h3>
        {state.message && (
          <p className="confirm-dialog__message">{state.message}</p>
        )}
        <div className="modal__actions confirm-dialog__actions">
          <button
            ref={confirmBtnRef}
            type="button"
            className={`btn btn--primary ${state.danger ? 'btn--danger' : ''}`}
            onClick={onConfirm}
          >
            {state.confirmLabel}
          </button>
          {!isAlert && (
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              {state.cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return ctx;
}
