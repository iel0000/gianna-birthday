import PhotoFrame from './PhotoFrame.jsx';

export default function Hero() {
  return (
    <header className="hero">
      <div className="hero__portrait">
        <PhotoFrame
          src="/photos/gianna-hero.jpg"
          alt="Gianna Avery Magsino"
          shape="circle"
          size="lg"
        />
      </div>

      <div className="hero__crest">
        <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
          <defs>
            <linearGradient id="wing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ff7eb6" />
              <stop offset="100%" stopColor="#a07cff" />
            </linearGradient>
          </defs>
          <path
            d="M32 8 C20 18 12 24 12 36 C12 46 22 52 32 46 C42 52 52 46 52 36 C52 24 44 18 32 8 Z"
            fill="url(#wing)"
            opacity="0.9"
          />
          <circle cx="32" cy="34" r="3" fill="#fff" />
        </svg>
      </div>

      <p className="hero__eyebrow">You are invited to celebrate our little Avery</p>
      <h1 className="hero__name">
        <span>Gianna</span>
        <span className="hero__middle">Avery</span>
        <span>Magsino</span>
      </h1>
      <p className="hero__subtitle">First Birthday &amp; Christening</p>

      <div className="hero__divider" aria-hidden="true">
        <span />
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 1 L12 8 L19 10 L12 12 L10 19 L8 12 L1 10 L8 8 Z" fill="#d94994" /></svg>
        <span />
      </div>

      <p className="hero__date">
        <span className="hero__date-day">Saturday</span>
        <span className="hero__date-main">October 3, 2026</span>
        <span className="hero__date-time">1:30 PM</span>
      </p>

      <p className="hero__tag">A pink &amp; purple fairy soirée</p>
    </header>
  );
}
