import { useEffect, useState } from 'react';
import Sparkles from './Sparkles.jsx';
import BackgroundImages from './BackgroundImages.jsx';
import Login from './Login.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { recordGodparent } from '../utils/rsvpDb.js';
import { isSupabaseConfigured } from '../utils/supabaseClient.js';

export default function Godparents() {
  const { user, ready } = useAuth();
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState(null); // 'yes' | 'no' | null
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok, reason, declined }

  useEffect(() => {
    document.title = "Be Avery's Godparent — RSVP";
  }, []);

  const goHome = () => {
    window.location.hash = '';
  };

  const onSubmitYes = async (e) => {
    e.preventDefault();
    if (!user) return; // shouldn't happen — guarded above

    setSubmitting(true);
    const res = await recordGodparent({
      name: user.name,
      email: user.email,
      message
    });
    setResult(res);
    setSubmitting(false);
  };

  const onAnswerNo = () => {
    setAnswer('no');
    setResult({ ok: true, declined: true });
  };

  // ─── Auth gate ───
  if (!ready) {
    return (
      <div className="page">
        <BackgroundImages />
        <Sparkles />
        <main className="page__main">
          <section className="card card--loading">Sprinkling fairy dust…</section>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        <BackgroundImages />
        <Sparkles />
        <main className="page__main">
          <section className="card godparents__intro">
            <p className="card__eyebrow">A heartfelt question</p>
            <h2 className="card__title godparents__title">
              Will you be one of Avery's godparents?
            </h2>
            <p className="card__lede">
              Sign in below with your name and email — the same details you'd use for the RSVP —
              and we'll continue.
            </p>
          </section>
          <div className="page__rsvp">
            <Login />
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

  // ─── Result screen ───
  if (result?.ok) {
    return (
      <div className="page">
        <BackgroundImages />
        <Sparkles />
        <main className="page__main">
          <section className="card godparents__result">
            <div className="rsvp__burst" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} className="rsvp__burst-dot" style={{ '--i': i }} />
              ))}
            </div>
            {result.declined ? (
              <>
                <h2 className="card__title">Thank you for considering 💜</h2>
                <p className="card__lede">
                  We are so grateful you took the time to think it over. Your love and presence at
                  Avery's celebration mean the world.
                </p>
              </>
            ) : (
              <>
                <p className="card__eyebrow">It's official ✨</p>
                <h2 className="card__title">
                  Welcome to the fairy ring, {user.name.split(' ')[0]} 💜
                </h2>
                <p className="card__lede">
                  Your name has been added as one of Avery's godparents. We will be in touch about
                  the christening details, and our family is so deeply grateful you said yes.
                </p>
                {message.trim() && (
                  <div className="rsvp__locked-message">
                    <p className="rsvp__locked-label">Your message</p>
                    <p className="rsvp__locked-quote">&ldquo;{message.trim()}&rdquo;</p>
                  </div>
                )}
              </>
            )}
            <button type="button" className="btn btn--primary" onClick={goHome}>
              Back to the invitation
            </button>
          </section>
        </main>
      </div>
    );
  }

  // ─── Initial question ───
  if (!answer) {
    return (
      <div className="page">
        <BackgroundImages />
        <Sparkles />
        <main className="page__main">
          <section className="card godparents__intro">
            <p className="card__eyebrow">For {user.name}</p>
            <h2 className="card__title godparents__title">
              Will you be one of Avery's godparents?
            </h2>
            <p className="card__lede">
              We would be deeply honoured to have you walk alongside Avery in faith and love —
              guiding her, praying for her, and being a steady presence in her life. If your heart
              says yes, we would love to make it official.
            </p>

            <div className="godparents__choice">
              <button
                type="button"
                className="btn btn--primary godparents__yes"
                onClick={() => setAnswer('yes')}
              >
                💜 &nbsp; Yes, with all my heart
              </button>
              <button
                type="button"
                className="btn btn--ghost godparents__no"
                onClick={onAnswerNo}
              >
                Not at this time
              </button>
            </div>

            <p className="godparents__back">
              <button type="button" className="link-button" onClick={goHome}>
                ← back to the invitation
              </button>
            </p>
          </section>
        </main>
      </div>
    );
  }

  // ─── "Yes" — optional message, then confirm ───
  return (
    <div className="page">
      <BackgroundImages />
      <Sparkles />
      <main className="page__main">
        <section className="card godparents__form-card">
          <p className="card__eyebrow">Almost official, {user.name}</p>
          <h2 className="card__title">A blessing, if you'd like to share one ✨</h2>
          <p className="card__lede">
            Anything you'd like to write to Avery is treasured but completely optional. We'll save
            your "yes" the moment you confirm.
          </p>

          {!isSupabaseConfigured() && (
            <div className="banner banner--info">
              The godparents database is not configured yet. Add your Supabase keys to enable saving.
            </div>
          )}

          <form className="form" onSubmit={onSubmitYes}>
            <label className="form__field">
              <span>A blessing for Avery (optional)</span>
              <textarea
                rows="4"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="A wish, a prayer, a sprinkle of fairy dust…"
              />
            </label>

            {result && !result.ok && (
              <div className="form__error" role="alert">{result.reason}</div>
            )}

            <div className="godparents__choice">
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? 'Adding to the fairy ring…' : 'Confirm, I will be a godparent ✨'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setAnswer(null)}
                disabled={submitting}
              >
                Go back
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
