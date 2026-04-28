import { useEffect, useState } from 'react';
import { generateInvitationCard } from '../utils/invitationCard.js';

export default function InvitationCardModal({ user, rsvp, onClose }) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  const inviteUrl = user.invitation?.guid
    ? `${window.location.origin}/?invite=${user.invitation.guid}`
    : window.location.origin;

  useEffect(() => {
    let cancelled = false;
    setError('');
    generateInvitationCard({ user, rsvp, inviteUrl })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch((err) => {
        console.error('[invitation card] failed', err);
        if (!cancelled) setError(err?.message || 'Could not draw your card.');
      });
    return () => {
      cancelled = true;
    };
  }, [user, rsvp, inviteUrl]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    const safe = (user.invitation?.name || user.name || 'guest')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase();
    a.download = `avery-invitation-${safe}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Your invitation card"
      onClick={onClose}
    >
      <div
        className="modal__inner card-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <p className="card__eyebrow">Your invitation pass</p>
        <h3 className="modal__title">Welcome to the fairy ring ✨</h3>
        <p className="modal__sub">
          Save this card and present it at the door — it has your seat count,
          your name, and a QR for the host to scan.
        </p>

        <div className="card-modal__preview">
          {error ? (
            <p className="modal__loading">{error}</p>
          ) : dataUrl ? (
            <img src={dataUrl} alt="Your personalised invitation card" />
          ) : (
            <p className="modal__loading">Drawing fairy dust…</p>
          )}
        </div>

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={download}
            disabled={!dataUrl}
          >
            ⬇︎ &nbsp; Download my pass
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
