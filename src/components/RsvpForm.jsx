import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getRsvpFor, saveRsvp } from '../utils/storage.js';
import { sendRsvpEmails } from '../utils/emailService.js';
import { isEmailConfigured } from '../utils/emailConfig.js';
import {
  persistRsvpToSupabase,
  fetchRsvpFromSupabase,
  recordGodparent
} from '../utils/rsvpDb.js';
import { isValidEmail } from '../utils/validators.js';

const initialState = {
  email: '',
  attending: 'yes',
  seats: 1,
  bringingKids: false,
  kidsCount: 1,
  message: ''
};

// `mode` controls the wording + side effects:
//   "guest"     — standard RSVP (default)
//   "godparent" — same RSVP fields, but also marks the row as a godparent
//                 and inserts into the godparents table.
export default function RsvpForm({ mode = 'guest' }) {
  const isGodparent = mode === 'godparent';
  const { user } = useAuth();
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [emailNote, setEmailNote] = useState('');
  const [dbNote, setDbNote] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadExistingRsvp() {
      const local = getRsvpFor(user);
      if (local) {
        if (!cancelled) {
          setSubmitted(local);
          setChecking(false);
        }
        return;
      }

      // Skip remote lookup if there's no email and no invitation — nothing to look up by.
      if (!user.email && !user.invitation?.id) {
        if (!cancelled) setChecking(false);
        return;
      }
      const remote = user.email ? await fetchRsvpFromSupabase(user.email) : null;
      if (cancelled) return;
      if (remote) {
        saveRsvp(user, {
          attending: remote.attending,
          seats: remote.seats,
          bringingKids: remote.bringingKids,
          kidsCount: remote.kidsCount,
          isGodparent: remote.isGodparent,
          message: remote.message
        });
        setSubmitted(remote);
      } else if (user.reservedSeats) {
        setForm((prev) => ({ ...prev, seats: user.reservedSeats }));
      }
      setChecking(false);
    }

    loadExistingRsvp();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  if (checking) {
    return (
      <section className="rsvp card card--loading" aria-label="Checking your RSVP">
        Checking the fairy ring for your RSVP…
      </section>
    );
  }

  const update = (field) => (e) => {
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setEmailNote('');

    // Validate email only if one was provided — it's optional now.
    const typedEmail = (form.email || '').trim();
    if (typedEmail && !isValidEmail(typedEmail)) {
      setEmailNote('That email looks a bit off — please double-check it or leave it blank.');
      return;
    }

    setSubmitting(true);

    // Promote the typed email onto the user object so storage + db keys
    // can use it. Falls back to whatever was already in the session.
    const userForSubmit = typedEmail
      ? { ...user, email: typedEmail }
      : user;

    const attending = form.attending === 'yes';
    const rsvp = {
      attending,
      seats: attending ? Math.max(1, Number(form.seats) || 1) : 0,
      bringingKids: attending && form.bringingKids,
      kidsCount:
        attending && form.bringingKids
          ? Math.max(1, Number(form.kidsCount) || 1)
          : 0,
      isGodparent,
      message: form.message.trim()
    };

    const saved = saveRsvp(userForSubmit, rsvp);
    setSubmitted(saved);

    const tasks = [
      // Email only fires when the guest provided one.
      typedEmail || userForSubmit.email
        ? sendRsvpEmails({ user: userForSubmit, rsvp: saved })
        : Promise.resolve({ sent: false, reason: 'no email provided' }),
      persistRsvpToSupabase({ user: userForSubmit, rsvp: saved })
    ];
    if (isGodparent && userForSubmit.email) {
      tasks.push(
        recordGodparent({
          name: userForSubmit.invitation?.name || userForSubmit.name,
          email: userForSubmit.email,
          message: saved.message
        })
      );
    }

    const [emailResult, dbResult, godparentResult] = await Promise.all(tasks);

    if (emailResult.sent) {
      setEmailNote('A confirmation has fluttered into your inbox. ✨');
    } else {
      setEmailNote(`RSVP saved. Email note: ${emailResult.reason}`);
    }

    if (dbResult.ok && (!isGodparent || godparentResult?.ok)) {
      setDbNote(
        isGodparent
          ? 'Saved to the guest list and the fairy godparents ring ✨'
          : 'Saved to the guest list ✓'
      );
    } else {
      const reason = !dbResult.ok
        ? dbResult.reason
        : godparentResult?.reason || 'unknown error';
      console.warn('[RSVP db] persist failed:', reason);
      setDbNote(`Database note: ${reason}`);
    }

    setSubmitting(false);
  };

  const displayName = user.invitation?.name || user.name;

  // ─── Locked summary (after submission or returning visit) ───
  if (submitted) {
    const showGodparent = !!submitted.isGodparent || isGodparent;
    return (
      <section className="rsvp card" aria-label="Your RSVP">
        <div className="rsvp__header">
          <div>
            <p className="card__eyebrow">Welcome back, {displayName}</p>
            <h2 className="card__title">
              {submitted.attending ? 'Your seat is saved 💜' : 'We will miss you 🌸'}
            </h2>
          </div>
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
                  {submitted.seats === 1 ? 'seat' : 'seats'} reserved under <strong>{displayName}</strong>
                </div>
              </div>

              {submitted.bringingKids && submitted.kidsCount > 0 && (
                <p className="rsvp__locked-text">
                  Bringing {submitted.kidsCount} {submitted.kidsCount === 1 ? 'little one' : 'little ones'} 🌸
                </p>
              )}

              {showGodparent && (
                <p className="rsvp__locked-text">
                  Lovingly listed as one of Avery's godparents 💜
                </p>
              )}

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

  // ─── Active form ───
  return (
    <section className="rsvp card" aria-label="RSVP form">
      <div className="rsvp__header">
        <div>
          <p className="card__eyebrow">For {displayName}</p>
          <h2 className="card__title">
            {isGodparent ? 'RSVP as a godparent 💜' : 'Will you join the fairy ring?'}
          </h2>
        </div>
      </div>

      {!isEmailConfigured() && (
        <div className="banner banner--info">
          Email confirmations are not configured yet. Add your EmailJS keys in
          <code> src/utils/emailConfig.js</code> to enable the guest &amp; host emails.
        </div>
      )}

      <form className="form" onSubmit={onSubmit}>
        <label className="form__field">
          <span>Email (optional)</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <small className="form__hint">
            We'll send a confirmation if you add one — totally optional.
          </small>
        </label>

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
          <>
            <div className="reserved-seats" role="status">
              <div className="reserved-seats__count">{user.reservedSeats}</div>
              <div className="reserved-seats__label">
                {user.reservedSeats === 1 ? 'seat' : 'seats'} reserved for you
              </div>
              <p className="reserved-seats__note">
                We have set aside this number of seats just for {displayName.split(' ')[0]}'s party. Please confirm — RSVPs cannot be edited online once submitted.
              </p>
            </div>

            <div className="form__field">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={form.bringingKids}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bringingKids: e.target.checked }))
                  }
                />
                <span className="switch__track" aria-hidden="true">
                  <span className="switch__thumb" />
                </span>
                <span className="switch__label">Bringing little ones with you?</span>
              </label>
            </div>

            {form.bringingKids && (
              <label className="form__field">
                <span>How many little ones?</span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={form.kidsCount}
                  onChange={update('kidsCount')}
                />
                <small className="form__hint">
                  Helps us plan kid-sized seats and treats 🌸
                </small>
              </label>
            )}
          </>
        )}

        <label className="form__field">
          <span>
            {isGodparent
              ? 'A blessing for Avery (optional)'
              : 'A message for Avery (optional)'}
          </span>
          <textarea
            rows="3"
            value={form.message}
            onChange={update('message')}
            placeholder="Send a wish, a blessing, or a sprinkle of fairy dust…"
          />
        </label>

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting
            ? 'Sending fairy mail…'
            : isGodparent
              ? 'Confirm — I will be a godparent ✨'
              : 'Send my RSVP'}
        </button>
      </form>
    </section>
  );
}
