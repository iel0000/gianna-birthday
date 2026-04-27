import { useEffect, useState } from 'react';
import Sparkles from './Sparkles.jsx';
import BackgroundImages from './BackgroundImages.jsx';
import { recordGodparent } from '../utils/rsvpDb.js';
import { isSupabaseConfigured } from '../utils/supabaseClient.js';
import { isValidEmail } from '../utils/validators.js';

const initialState = {
  name: '',
  email: '',
  message: ''
};

export default function Godparents() {
  const [form, setForm] = useState(initialState);
  const [answer, setAnswer] = useState(null);   // 'yes' | 'no' | null
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);   // { ok, reason }
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = "Be Avery's Godparent — RSVP";
  }, []);

  const update = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const goHome = () => {
    window.location.hash = '';
  };

  const onSubmitYes = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim() || !form.email.trim()) {
      setError('Please share your name and email so we can record your blessing.');
      return;
    }
    if (!isValidEmail(form.email)) {
      setError('That email looks a bit off — please double-check it.');
      return;
    }

    setSubmitting(true);
    const res = await recordGodparent({
      name: form.name,
      email: form.email,
      message: form.message
    });
    setResult(res);
    setSubmitting(false);
  };

  const onAnswerNo = () => {
    setAnswer('no');
    setResult({ ok: true, declined: true });
  };

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
                <h2 className="card__title">Welcome to the fairy ring, {form.name.split(' ')[0]} 💜</h2>
                <p className="card__lede">
                  Your name has been added as one of Avery's godparents. We will be in touch about
                  the christening details, and our family is so deeply grateful you said yes.
                </p>
                {form.message.trim() && (
                  <div className="rsvp__locked-message">
                    <p className="rsvp__locked-label">Your message</p>
                    <p className="rsvp__locked-quote">&ldquo;{form.message.trim()}&rdquo;</p>
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

  // ─── Initial question (no answer yet) ───
  if (!answer) {
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

  // ─── "Yes" form (collect details) ───
  return (
    <div className="page">
      <BackgroundImages />
      <Sparkles />
      <main className="page__main">
        <section className="card godparents__form-card">
          <p className="card__eyebrow">Almost official</p>
          <h2 className="card__title">A few details, dear godparent ✨</h2>
          <p className="card__lede">
            Tell us your name and email so we can keep you in the loop about the christening.
            Anything you'd like to write to Avery is treasured but optional.
          </p>

          {!isSupabaseConfigured() && (
            <div className="banner banner--info">
              The godparents database is not configured yet. Add your Supabase keys to enable saving.
            </div>
          )}

          <form className="form" onSubmit={onSubmitYes} noValidate>
            <label className="form__field">
              <span>Your full name</span>
              <input
                type="text"
                value={form.name}
                onChange={update('name')}
                autoComplete="name"
                placeholder="Tinkerbell of the Glade"
                required
              />
            </label>

            <label className="form__field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={update('email')}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="form__field">
              <span>A blessing for Avery (optional)</span>
              <textarea
                rows="3"
                value={form.message}
                onChange={update('message')}
                placeholder="A wish, a prayer, a sprinkle of fairy dust…"
              />
            </label>

            {(error || (result && !result.ok)) && (
              <div className="form__error" role="alert">
                {error || result?.reason}
              </div>
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
