import { useEffect, useState } from 'react';
import { generateInvitationCard } from '../utils/invitationCard.js';
import { savePng } from '../utils/savePng.js';
import ModalPortal from './ModalPortal.jsx';

export default function InvitationCardModal({ user, rsvp, onClose }) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    generateInvitationCard({ user, rsvp })
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
  }, [user, rsvp]);

  const download = async () => {
    if (!dataUrl || saving) return;
    const safe = (user.invitation?.name || user.name || 'guest')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase();
    setSaving(true);
    setSaveError('');
    try {
      await savePng({
        dataUrl,
        filename: `avery-invitation-${safe}.png`,
        shareTitle: "Avery's invitation"
      });
    } catch (err) {
      console.warn('[invitation card] save failed', err);
      setSaveError('Could not save it automatically — press and hold the card above.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal
      label="Your invitation card"
      innerClassName="card-modal"
      onClose={onClose}
    >
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

      {saveError && (
        <div className="form__error" role="alert">
          {saveError}
        </div>
      )}

      <div className="modal__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={download}
          disabled={!dataUrl || saving}
        >
          ⬇︎ &nbsp; {saving ? 'Saving…' : 'Save my pass'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalPortal>
  );
}
