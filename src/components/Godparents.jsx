import { useEffect } from 'react';
import Sparkles from './Sparkles.jsx';
import BackgroundImages from './BackgroundImages.jsx';
import Login from './Login.jsx';
import RsvpForm from './RsvpForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// The godparent RSVP page. Identical RSVP fields to the regular page,
// plus a heartfelt header explaining the role. On submit, RsvpForm in
// "godparent" mode also writes to the godparents table.
export default function Godparents() {
  const { user, ready } = useAuth();

  useEffect(() => {
    document.title = "Be Avery's Godparent — RSVP";
  }, []);

  const goHome = () => {
    window.location.hash = '';
  };

  return (
    <div className="page">
      <BackgroundImages />
      <Sparkles />

      <main className="page__main">
        <section className="card godparents__intro">
          <p className="card__eyebrow">A heartfelt invitation</p>
          <h2 className="card__title godparents__title">
            Will you be one of Avery's godparents?
          </h2>
          <p className="card__lede">
            We would be deeply honoured to have you walk alongside Avery in faith and love —
            guiding her, praying for her, and being a steady presence in her life. Submitting this
            RSVP confirms your "yes" and reserves your seats for the celebration.
          </p>
        </section>

        <div className="page__rsvp">
          {!ready ? (
            <div className="card card--loading">Sprinkling fairy dust…</div>
          ) : user ? (
            <RsvpForm mode="godparent" />
          ) : (
            <Login />
          )}
        </div>

        <p className="godparents__back">
          <button type="button" className="link-button" onClick={goHome}>
            ← back to the invitation
          </button>
        </p>
      </main>
    </div>
  );
}
