import { useEffect, useMemo, useState } from 'react';
import Sparkles from './Sparkles.jsx';
import BackgroundImages from './BackgroundImages.jsx';
import { fetchAllRsvps } from '../utils/rsvpDb.js';
import {
  adminSignIn,
  adminSignOut,
  getAdminSession,
  onAdminAuthChange
} from '../utils/adminAuth.js';
import { isSupabaseConfigured } from '../utils/supabaseClient.js';

// Convert an array of objects into a CSV string. Quotes any value that
// contains a comma, quote, or newline; escapes embedded quotes.
function toCsv(rows, columns) {
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escape(c.get(row))).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const RSVP_COLUMNS = [
  { label: 'Name', get: (r) => r.name },
  { label: 'Email', get: (r) => r.email },
  { label: 'Attending', get: (r) => (r.attending ? 'Yes' : 'No') },
  { label: 'Seats', get: (r) => r.seats },
  { label: 'Reserved Seats', get: (r) => r.reserved_seats ?? '' },
  { label: 'Bringing Kids', get: (r) => (r.bringing_kids ? 'Yes' : 'No') },
  { label: 'Kids Count', get: (r) => r.kids_count ?? 0 },
  { label: 'Godparent', get: (r) => (r.is_godparent ? 'Yes' : 'No') },
  { label: 'Message', get: (r) => r.message ?? '' },
  { label: 'Submitted At', get: (r) => r.submitted_at }
];

const GODPARENT_COLUMNS = [
  { label: 'Name', get: (g) => g.name },
  { label: 'Email', get: (g) => g.email },
  { label: 'Message', get: (g) => g.message ?? '' },
  { label: 'Responded At', get: (g) => g.responded_at }
];

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
};

export default function GuestList() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState({ rsvps: [], godparents: [], ok: false, reason: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Guest list — Avery's celebration";

    let cancelled = false;
    getAdminSession().then((s) => {
      if (!cancelled) {
        setSession(s);
        setAuthChecked(true);
      }
    });
    const unsubscribe = onAdminAuthChange((s) => {
      if (!cancelled) setSession(s);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setData({ rsvps: [], godparents: [], ok: false, reason: '' });
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const result = await fetchAllRsvps();
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const totals = useMemo(() => {
    const yes = data.rsvps.filter((r) => r.attending);
    return {
      responses: data.rsvps.length,
      attending: yes.length,
      seats: yes.reduce((sum, r) => sum + (r.seats || 0), 0),
      kids: yes.reduce((sum, r) => sum + (r.bringing_kids ? r.kids_count || 0 : 0), 0),
      godparents: data.godparents.length,
      declined: data.rsvps.length - yes.length
    };
  }, [data]);

  const exportRsvps = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`avery-rsvps-${stamp}.csv`, toCsv(data.rsvps, RSVP_COLUMNS));
  };

  const exportGodparents = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `avery-godparents-${stamp}.csv`,
      toCsv(data.godparents, GODPARENT_COLUMNS)
    );
  };

  const goHome = () => {
    window.location.hash = '';
  };

  const handleSignOut = async () => {
    await adminSignOut();
  };

  // ─── Auth gate ───
  if (!authChecked) {
    return (
      <div className="page">
        <BackgroundImages />
        <Sparkles />
        <main className="page__main">
          <section className="card card--loading">Checking your session…</section>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page">
        <BackgroundImages />
        <Sparkles />
        <main className="page__main">
          <AdminLogin onSignedIn={(s) => setSession(s)} goHome={goHome} />
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <BackgroundImages />
      <Sparkles />

      <main className="page__main guests">
        <header className="guests__header">
          <p className="card__eyebrow">Host view</p>
          <h1 className="guests__title">Guest list</h1>
          <p className="guests__subtitle">
            Live data from Supabase — refreshes when you reload the page.
          </p>
          <p className="guests__signed-in">
            Signed in as <strong>{session.user?.email}</strong>
            {' · '}
            <button type="button" className="link-button" onClick={handleSignOut}>
              sign out
            </button>
            {' · '}
            <button type="button" className="link-button" onClick={goHome}>
              back to the invitation
            </button>
          </p>
        </header>

        {loading ? (
          <section className="card card--loading">Loading the fairy ring…</section>
        ) : !data.ok ? (
          <section className="card">
            <h2 className="card__title">Could not load the guest list</h2>
            <p className="card__lede">
              {data.reason || 'Supabase is not configured for this site.'}
            </p>
          </section>
        ) : (
          <>
            <section className="guests__stats">
              <Stat label="Responses" value={totals.responses} />
              <Stat label="Attending" value={totals.attending} accent="pink" />
              <Stat label="Seats" value={totals.seats} accent="purple" />
              <Stat label="Kids" value={totals.kids} />
              <Stat label="Declined" value={totals.declined} />
              <Stat label="Godparents" value={totals.godparents} accent="gold" />
            </section>

            <section className="card guests__section">
              <div className="guests__section-head">
                <h2 className="card__title">RSVPs &nbsp;<span className="guests__count">{data.rsvps.length}</span></h2>
                <button
                  type="button"
                  className="btn btn--primary guests__export"
                  onClick={exportRsvps}
                  disabled={data.rsvps.length === 0}
                >
                  ⬇︎ &nbsp; Export RSVPs to CSV
                </button>
              </div>

              {data.rsvps.length === 0 ? (
                <p className="guests__empty">No RSVPs yet.</p>
              ) : (
                <div className="guests__table-wrap">
                  <table className="guests__table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Seats</th>
                        <th>Kids</th>
                        <th>Godparent</th>
                        <th>Message</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rsvps.map((r) => (
                        <tr key={r.email} className={r.attending ? '' : 'guests__row--declined'}>
                          <td>{r.name}</td>
                          <td>
                            <a href={`mailto:${r.email}`}>{r.email}</a>
                          </td>
                          <td>
                            <span
                              className={`guests__pill ${r.attending ? 'guests__pill--yes' : 'guests__pill--no'}`}
                            >
                              {r.attending ? 'Attending' : 'Declined'}
                            </span>
                          </td>
                          <td className="guests__num">{r.seats}</td>
                          <td className="guests__num">
                            {r.bringing_kids ? r.kids_count || 0 : ''}
                          </td>
                          <td>{r.is_godparent ? '💜' : ''}</td>
                          <td className="guests__msg">{r.message || '—'}</td>
                          <td className="guests__when">{fmtDate(r.submitted_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card guests__section">
              <div className="guests__section-head">
                <h2 className="card__title">Godparents &nbsp;<span className="guests__count">{data.godparents.length}</span></h2>
                <button
                  type="button"
                  className="btn btn--primary guests__export"
                  onClick={exportGodparents}
                  disabled={data.godparents.length === 0}
                >
                  ⬇︎ &nbsp; Export godparents to CSV
                </button>
              </div>

              {data.godparents.length === 0 ? (
                <p className="guests__empty">No godparent responses yet.</p>
              ) : (
                <div className="guests__table-wrap">
                  <table className="guests__table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Message</th>
                        <th>Responded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.godparents.map((g) => (
                        <tr key={g.email}>
                          <td>{g.name}</td>
                          <td>
                            <a href={`mailto:${g.email}`}>{g.email}</a>
                          </td>
                          <td className="guests__msg">{g.message || '—'}</td>
                          <td className="guests__when">{fmtDate(g.responded_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`guests__stat ${accent ? `guests__stat--${accent}` : ''}`}>
      <div className="guests__stat-value">{value}</div>
      <div className="guests__stat-label">{label}</div>
    </div>
  );
}

function AdminLogin({ onSignedIn, goHome }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your admin email and password.');
      return;
    }
    setSubmitting(true);
    const result = await adminSignIn({ email, password });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    onSignedIn?.(result.session);
  };

  return (
    <section className="card admin-login" aria-label="Admin sign in">
      <p className="card__eyebrow">Host access only</p>
      <h2 className="card__title">Sign in to view the guest list</h2>
      <p className="card__lede">
        This page is restricted to the admin account. Sign in with the email and password set up
        in your Supabase project's Authentication panel.
      </p>

      {!isSupabaseConfigured() && (
        <div className="banner banner--info">
          Supabase is not configured for this site, so admin sign-in is unavailable. Set
          <code> VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> first.
        </div>
      )}

      <form className="form" onSubmit={onSubmit} noValidate>
        <label className="form__field">
          <span>Admin email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="form__field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="•••••••••"
            required
          />
        </label>

        {error && <div className="form__error" role="alert">{error}</div>}

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Signing you in…' : 'Sign in'}
        </button>
      </form>

      <p className="godparents__back">
        <button type="button" className="link-button" onClick={goHome}>
          ← back to the invitation
        </button>
      </p>
    </section>
  );
}
