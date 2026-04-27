import { useEffect, useState } from 'react';
import Hero from './components/Hero.jsx';
import EventDetails from './components/EventDetails.jsx';
import Gallery from './components/Gallery.jsx';
import Login from './components/Login.jsx';
import RsvpForm from './components/RsvpForm.jsx';
import Sparkles from './components/Sparkles.jsx';
import BackgroundImages, { BackgroundCredits } from './components/BackgroundImages.jsx';
import Godparents from './components/Godparents.jsx';
import GuestList from './components/GuestList.jsx';
import { useAuth } from './context/AuthContext.jsx';
import './App.css';

// Tiny hash-based router. /#godparents → Godparents page, anything else → home.
// Hash routing is the simplest fit for GitHub Pages (no server rewrites needed)
// and survives the BASE_URL rewrites Vite already does for assets.
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

  if (hash === '#godparents') {
    return <Godparents />;
  }
  if (hash === '#guests' || hash === '#admin') {
    return <GuestList />;
  }

  return (
    <div className="page">
      <BackgroundImages />
      <Sparkles />

      <main className="page__main">
        <Hero />
        <EventDetails />
        <Gallery />

        <div className="page__rsvp" id="rsvp">
          {!ready ? (
            <div className="card card--loading">Sprinkling fairy dust…</div>
          ) : user ? (
            <RsvpForm />
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
