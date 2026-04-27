import { useEffect, useState } from 'react';
import Hero from './components/Hero.jsx';
import EventDetails from './components/EventDetails.jsx';
import Gallery from './components/Gallery.jsx';
import Login from './components/Login.jsx';
import RsvpForm from './components/RsvpForm.jsx';
import Sparkles from './components/Sparkles.jsx';
import BackgroundImages, { BackgroundCredits } from './components/BackgroundImages.jsx';
import GuestList from './components/GuestList.jsx';
import { useAuth } from './context/AuthContext.jsx';
import './App.css';

// Hash-based router for the admin guest list. The invitation flow no
// longer uses a hash — godparent vs guest is determined entirely by the
// invitation row in the database (invitation.is_godparent).
function useHashRoute() {
  const [hash, setHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export default function App() {
  const { user, ready } = useAuth();
  const hash = useHashRoute();

  if (hash === '#guests' || hash === '#admin') {
    return <GuestList />;
  }

  // Whether to show the godparent flow comes from the invitation in the
  // database, never the URL — the URL is just /?invite=<guid> for everyone.
  const isGodparentInvitation = !!user?.invitation?.is_godparent;

  return (
    <div className="page">
      <BackgroundImages />
      <Sparkles />

      <main className="page__main">
        <Hero />
        <EventDetails />
        <Gallery />

        {isGodparentInvitation && (
          <section className="card godparents__intro">
            <p className="card__eyebrow">A heartfelt invitation</p>
            <h2 className="card__title godparents__title">
              Will you be one of Avery's godparents?
            </h2>
            <p className="card__lede">
              We would be deeply honoured to have you walk alongside Avery in faith and love —
              guiding her, praying for her, and being a steady presence in her life. Submitting
              this RSVP confirms your "yes" and reserves your seats for the celebration.
            </p>
          </section>
        )}

        <div className="page__rsvp" id="rsvp">
          {!ready ? (
            <div className="card card--loading">Sprinkling fairy dust…</div>
          ) : user ? (
            <RsvpForm mode={isGodparentInvitation ? 'godparent' : 'guest'} />
          ) : (
            <Login />
          )}
        </div>
      </main>

      <footer className="page__footer">
        <p>With love, the Magsino family · 2026</p>
        <BackgroundCredits />
      </footer>
    </div>
  );
}
