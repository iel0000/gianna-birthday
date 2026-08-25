import { useEffect, useState } from 'react';
import {
  generateGodparentProposalCard,
  PROPOSAL_ROLES
} from '../utils/godparentProposalCard.js';
import ModalPortal from './ModalPortal.jsx';

const ROLE_KEYS = Object.keys(PROPOSAL_ROLES);

// Admin-side preview + download for the godparent proposal cards. There is
// one card per role and neither carries guest data, so this takes no
// invitation and lives outside the per-guest row actions.
export default function GodparentProposalModal({ onClose }) {
  const [role, setRole] = useState('ninong');
  const [cards, setCards] = useState({});
  const [error, setError] = useState('');

  // Both cards are drawn up front — they are cheap, and having them ready
  // makes switching roles instant and the download always available.
  useEffect(() => {
    let cancelled = false;
    const portraitSrc = `${import.meta.env.BASE_URL}photos/gianna-hero.jpg`;

    Promise.all(
      ROLE_KEYS.map((key) =>
        generateGodparentProposalCard({ role: key, portraitSrc }).then((dataUrl) => [
          key,
          dataUrl
        ])
      )
    )
      .then((entries) => {
        if (!cancelled) setCards(Object.fromEntries(entries));
      })
      .catch((err) => {
        console.error('[godparent proposal] card generation failed', err);
        if (!cancelled) setError(err?.message || 'Could not draw the proposal cards.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dataUrl = cards[role];

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = PROPOSAL_ROLES[role].file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <ModalPortal
      label="Godparent proposal cards"
      innerClassName="card-modal"
      onClose={onClose}
    >
      <p className="card__eyebrow">Godparent proposal</p>
      <h3 className="modal__title">Will you be my {PROPOSAL_ROLES[role].label}? 💜</h3>
      <p className="modal__sub">
        One card per role — send the same image to everyone you are asking. Their
        personalised invitation link still comes from the row menu below.
      </p>

      <div className="modal__choices" role="group" aria-label="Proposal role">
        {ROLE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`pill ${role === key ? 'pill--on' : ''}`}
            onClick={() => setRole(key)}
            aria-pressed={role === key}
          >
            {PROPOSAL_ROLES[key].label}
          </button>
        ))}
      </div>

      <div className="card-modal__preview">
        {error ? (
          <p className="modal__loading">{error}</p>
        ) : dataUrl ? (
          <img
            src={dataUrl}
            alt={`Proposal card asking: Will you be my ${PROPOSAL_ROLES[role].label}?`}
          />
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
          ⬇︎ &nbsp; Download {PROPOSAL_ROLES[role].label} card
        </button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalPortal>
  );
}
