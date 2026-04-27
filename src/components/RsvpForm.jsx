import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getRsvpFor, saveRsvp } from '../utils/storage.js';
import { sendRsvpEmails } from '../utils/emailService.js';
import { isEmailConfigured } from '../utils/emailConfig.js';
import { persistRsvpToSupabase } from '../utils/rsvpDb.js';

const initialState = {
  attending: 'yes',
  seats: 1,
  message: ''
};

export default function RsvpForm() {
  const { user, logout } = useAuth();
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // the locked RSVP after submit
  const [emailNote, setEmailNote] = useState('');
  const [dbNote, setDbNote] = useState('');

  useEffect(() => {
    if (!user) return;
    const existing = getRsvpFor(user.email);
    if (existing) {
      // Already RSVP'd — never show the form again.
      setSubmitted(existing);
    } else if (user.reservedSeats) {
      setForm((prev) => ({ ...prev, seats: user.reservedSeats }));
    }
  }, [user]);

  if (!user) return null;

  const update = (field) => (e) => {
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setEmailNote('');

    const rsvp = {
      attending: form.attending === 'yes',
      seats: form.attending === 'yes' ? Math.max(1, Number(form.seats) || 1) : 0,
      message: form.message.trim()
    };

    const saved = saveRsvp(user.email, rsvp);
    setSubmitted(saved);

    // Mirror to Supabase in parallel with the email — both are best-effort.
    // The local save above is the source of truth for the UX lock.
    const [emailResult, dbResult] = await Promise.all([
      sendRsvpEmails({ user, rsvp: saved }),
      persistRsvpToSupabase({ user, rsvp: saved })
    ]);
    if (emailResult.sent) {
      setEmailNote('A confirmation has fluttered into your inbox. ✨');
    } else {
      setEmailNote(`RSVP saved. Email note: ${emailResult.reason}`);
    }

    if (dbResult.ok) {
      setDbNote('Saved to the guest list ✓');
    } else {
      console.warn('[RSVP db] not persisted to Supabase:', dbResult.reason);
      setDbNote(`Database note: ${dbResult.reason}`);
    }

    setSubmitting(false);
  };

  // Once submitted, render a locked summary — no form, no resubmit path.
  if (submitted) {
    return (
      <section className="rsvp card" aria-label="Your RSVP">
        <div className="rsvp__header">
          <div>
            <p className="card__eyebrow">Welcome back, {user.name}</p>
            <h2 className="card__title">
              {submitted.attending ? 'Your seat is saved 💜' : 'We will miss you 🌸'}
            </h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={logout}>Sign out</button>
        </div>

        <div className="rsvp__locked" role="status">
          <div className="rsvp__burst" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="rsvp__burst-dot" style={{ '--i': i }} />
            ))}
          </div>

          {submitted.attending ? (
            <>
              <div className="reserved-seats reserved-seats--locked">
                <div className="reserved-seats__count">{submitted.seats}</div>
                <div className="reserved-seats__label">
                  {submitted.seats === 1 ? 'seat' : 'seats'} reserved under <strong>{user.name}</strong>
                </div>
              </div>

              {submitted.message && (
                <div className="rsvp__locked-message">
                  <p className="rsvp__locked-label">Your message for Avery</p>
                  <p className="rsvp__locked-quote">&ldquo;{submitted.message}&rdquo;</p>
                </div>
              )}
            </>
          ) : (
            <p className="rsvp__locked-text">
              Thank you for letting us know. Your blessings are still with Avery.
            </p>
          )}

          <p className="rsvp__locked-footer">
            Your RSVP has been recorded. If something needs to change, please reply to your
            confirmation email and we will update it on your behalf.
          </p>

          {emailNote && <p className="rsvp__note">{emailNote}</p>}
          {dbNote && <p className="rsvp__note">{dbNote}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="rsvp card" aria-label="RSVP form">
      <div className="rsvp__header">
        <div>
          <p className="card__eyebrow">Welcome, {user.name}</p>
          <h2 className="card__title">Will you join the fairy ring?</h2>
        </div>
        <button type="button" className="btn btn--ghost" onClick={logout}>Sign out</button>
      </div>

      {!isEmailConfigured() && (
        <div className="banner banner--info">
          Email confirmations are not configured yet. Add your EmailJS keys in
          <code> src/utils/emailConfig.js</code> to enable the guest &amp; host emails.
        </div>
      )}

      <form className="form" onSubmit={onSubmit}>
        <fieldset className="form__field form__field--inline">
          <legend>Are you attending?</legend>
          <label className={`pill ${form.attending === 'yes' ? 'pill--on' : ''}`}>
            <input type="radio" name="attending" value="yes" checked={form.attending === 'yes'} onChange={update('attending')} />
            <span>Yes, with bells on</span>
          </label>
          <label className={`pill ${form.attending === 'no' ? 'pill--on' : ''}`}>
            <input type="radio" name="attending" value="no" checked={form.attending === 'no'} onChange={update('attending')} />
            <span>Cannot make it</span>
          </label>
        </fieldset>

        {form.attending === 'yes' && (
          <div className="reserved-seats" role="status">
            <div className="reserved-seats__count">{user.reservedSeats}</div>
            <div className="reserved-seats__label">
              {user.reservedSeats === 1 ? 'seat' : 'seats'} reserved for you
            </div>
            <p className="reserved-seats__note">
              We have set aside this number of seats just for {user.name.split(' ')[0]}'s party. Please confirm — RSVPs cannot be edited online once submitted.
            </p>
          </div>
        )}

        <label className="form__field">
          <span>A message for Avery (optional)</span>
          <textarea rows="3" value={form.message} onChange={update('message')} placeholder="Send a wish, a blessing, or a sprinkle of fairy dust…" />
        </label>

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Sending fairy mail…' : 'Send my RSVP'}
        </button>
      </form>
    </section>
  );
}
