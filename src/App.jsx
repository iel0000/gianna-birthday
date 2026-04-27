import Hero from './components/Hero.jsx';
import EventDetails from './components/EventDetails.jsx';
import Gallery from './components/Gallery.jsx';
import Login from './components/Login.jsx';
import RsvpForm from './components/RsvpForm.jsx';
import Sparkles from './components/Sparkles.jsx';
import BackgroundImages, { BackgroundCredits } from './components/BackgroundImages.jsx';
import { useAuth } from './context/AuthContext.jsx';
import './App.css';

export default function App() {
  const { user, ready } = useAuth();

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
