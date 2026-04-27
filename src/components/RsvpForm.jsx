import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getRsvpFor, saveRsvp } from '../utils/storage.js';
import { sendRsvpEmails } from '../utils/emailService.js';
import { isEmailConfigured } from '../utils/emailConfig.js';

const initialState = {
  attending: 'yes',
  seats: 1,
  message: ''
};

export default function RsvpForm() {
  const { user, logout } = useAuth();
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [emailNote, setEmailNote] = useState('');

  useEffect(() => {
    if (!user) return;
    const existing = getRsvpFor(user.email);
    if (existing) {
      setForm({
        attending: existing.attending ? 'yes' : 'no',
        seats: user.reservedSeats || existing.seats,
        message: existing.message || ''
      });
      setResult({
        attending: existing.attending,
        seats: user.reservedSeats || existing.seats,
        savedBefore: true
      });
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
    setResult({ attending: saved.attending, seats: saved.seats });

    const emailResult = await sendRsvpEmails({ user, rsvp: saved });
    if (emailResult.sent) {
      setEmailNote('A confirmation has fluttered into your inbox. ✨');
    } else {
      setEmailNote(`RSVP saved. Email note: ${emailResult.reason}`);
    }

    setSubmitting(false);
  };

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
              We have set aside this number of seats just for {user.name.split(' ')[0]}'s party. If something needs to change, just reply to your confirmation email.
            </p>
          </div>
        )}

        <label className="form__field">
          <span>A message for Avery (optional)</span>
          <textarea rows="3" value={form.message} onChange={update('message')} placeholder="Send a wish, a blessing, or a sprinkle of fairy dust…" />
        </label>

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Sending fairy mail…' : (result?.savedBefore ? 'Update my RSVP' : 'Send my RSVP')}
        </button>
      </form>

      {result && (
        <div className="rsvp__result" role="status">
          <div className="rsvp__burst" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="rsvp__burst-dot" style={{ '--i': i }} />
            ))}
          </div>
          <h3>{result.attending ? 'Your seat is saved 💜' : 'We will miss you 🌸'}</h3>
          {result.attending ? (
            <p>{result.seats} {result.seats === 1 ? 'seat' : 'seats'} reserved under <strong>{user.name}</strong>.</p>
          ) : (
            <p>Thank you for letting us know. Your blessings are still with Avery.</p>
          )}
          {emailNote && <p className="rsvp__note">{emailNote}</p>}
        </div>
      )}
    </section>
  );
}
