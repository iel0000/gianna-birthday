import { useEffect, useState } from 'react';
import { generateGenericInvitationCard } from '../utils/genericInvitationCard.js';
import { savePng } from '../utils/savePng.js';
import ModalPortal from './ModalPortal.jsx';

// Admin-side preview + save for the generic invitation card. It carries no
// guest name and no seat count, so it takes no invitation — one image for
// group chats, stories, or a printed board at the door.
export default function GenericInvitationModal({ onClose }) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const portraitSrc = `${import.meta.env.BASE_URL}photos/gianna-hero.jpg`;
    generateGenericInvitationCard({ portraitSrc })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch((err) => {
        console.error('[generic invitation] card generation failed', err);
        if (!cancelled) setError(err?.message || 'Could not draw the card.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const download = () =>
    dataUrl &&
    savePng({
      dataUrl,
      filename: 'avery-invitation.png',
      shareTitle: "You're invited — Avery's 1st birthday & dedication"
    });

  return (
    <ModalPortal
      label="Generic invitation card"
      innerClassName="card-modal"
      onClose={onClose}
    >
      <p className="card__eyebrow">Generic invitation</p>
      <h3 className="modal__title">You are invited ✨</h3>
      <p className="modal__sub">
        No name, no seat count — safe to post in a group chat or print for the
        door. Anyone who needs to RSVP still needs their own link.
      </p>

      <div className="card-modal__preview">
        {error ? (
          <p className="modal__loading">{error}</p>
        ) : dataUrl ? (
          <img src={dataUrl} alt="Invitation card for Avery's 1st birthday and dedication" />
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
          ⬇︎ &nbsp; Download PNG
        </button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalPortal>
  );
}
