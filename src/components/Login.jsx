import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, pendingReservedSeats } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      login({ name, email });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="login card" aria-label="Sign in to RSVP">
      {pendingReservedSeats && (
        <div className="login__reserved" role="status">
          <span className="login__reserved-icon" aria-hidden="true">✨</span>
          <div>
            <strong>{pendingReservedSeats} {pendingReservedSeats === 1 ? 'seat' : 'seats'} reserved for you</strong>
            <p>Enter your name and email below — we will lock these seats to your name.</p>
          </div>
        </div>
      )}
      <h2 className="card__title">Step into the fairy ring</h2>
      <p className="card__lede">Sign in with your name and email to send your RSVP.</p>

      <form className="form" onSubmit={onSubmit} noValidate>
        <label className="form__field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tinkerbell of the Glade"
            required
            autoComplete="name"
          />
        </label>

        <label className="form__field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </label>

        {error && <div className="form__error" role="alert">{error}</div>}

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Opening the gate…' : 'Enter the celebration'}
        </button>
      </form>
    </section>
  );
}
