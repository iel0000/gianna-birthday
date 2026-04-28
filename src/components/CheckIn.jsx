import { useEffect, useMemo, useState } from 'react';
import Sparkles from './Sparkles.jsx';
import BackgroundImages from './BackgroundImages.jsx';
import {
  fetchAllInvitationsWithStatus,
  setRsvpCheckIn
} from '../utils/rsvpDb.js';
import {
  adminSignOut,
  getAdminSession,
  onAdminAuthChange
} from '../utils/adminAuth.js';

const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
};

export default function CheckIn() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [filters, setFilters] = useState({
    search: '',
    state: 'all', // 'all' | 'pending' | 'arrived'
    godparent: false,
    kids: false
  });
  const [savingId, setSavingId] = useState(null);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    document.title = "Attendance — Avery's celebration";
    let cancelled = false;
    getAdminSession().then((s) => {
      if (!cancelled) {
        setSession(s);
        setAuthChecked(true);
      }
    });
    const unsub = onAdminAuthChange((s) => {
      if (!cancelled) setSession(s);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setInvitations([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchAllInvitationsWithStatus().then((res) => {
      if (cancelled) return;
      setInvitations(res.invitations || []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session, tick]);

  // Only attending guests are part of the door list — declined / pending are
  // hidden by default but can be revealed via the filter pills (pending row
  // covers walk-ins who hadn't RSVP'd in advance).
  const attending = useMemo(
    () => invitations.filter((i) => i.status === 'attending'),
    [invitations]
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return attending.filter((i) => {
      if (q && !(i.name || '').toLowerCase().includes(q)) return false;
      if (filters.state === 'pending' && i.checked_in) return false;
      if (filters.state === 'arrived' && !i.checked_in) return false;
      if (filters.godparent && !i.is_godparent) return false;
      if (filters.kids && !i.rsvp_bringing_kids) return false;
      return true;
    });
  }, [attending, filters]);

  const totals = useMemo(() => {
    const arrived = attending.filter((i) => i.checked_in);
    const arrivedSeats = arrived.reduce((s, i) => s + (i.rsvp_seats || 0), 0);
    const arrivedKids = arrived.reduce(
      (s, i) => s + (i.rsvp_bringing_kids ? i.rsvp_kids_count || 0 : 0),
      0
    );
    const expectedSeats = attending.reduce((s, i) => s + (i.rsvp_seats || 0), 0);
    const expectedKids = attending.reduce(
      (s, i) => s + (i.rsvp_bringing_kids ? i.rsvp_kids_count || 0 : 0),
      0
    );
    return {
      arrivedParties: arrived.length,
      expectedParties: attending.length,
      arrivedSeats,
      expectedSeats,
      arrivedKids,
      expectedKids
    };
  }, [attending]);

  const toggle = async (invitation) => {
    if (savingId) return;
    setSavingId(invitation.id);
    // Optimistic flip — if it fails we re-fetch and the truth wins.
    setInvitations((prev) =>
      prev.map((i) =>
        i.id === invitation.id
          ? {
              ...i,
              checked_in: !i.checked_in,
              checked_in_at: !i.checked_in ? new Date().toISOString() : null
            }
          : i
      )
    );
    const res = await setRsvpCheckIn({
      invitationId: invitation.id,
      checkedIn: !invitation.checked_in
    });
    setSavingId(null);
    if (!res.ok) {
      console.warn('[CheckIn] save failed', res.reason);
      refresh();
    }
  };

  const filtersActive =
    filters.search ||
    filters.state !== 'all' ||
    filters.godparent ||
    filters.kids;

  const clearFilters = () =>
    setFilters({ search: '', state: 'all', godparent: false, kids: false });

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
          <section className="card admin-login">
            <p className="card__eyebrow">Host access only</p>
            <h2 className="card__title">Please sign in first</h2>
            <p className="card__lede">
              The attendance page needs an admin session. Sign in via the{' '}
              <a href="#guests" className="link-button">
                guest list
              </a>{' '}
              and the page will load.
            </p>
          </section>
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
          <p className="card__eyebrow">Door &amp; Attendance</p>
          <h1 className="guests__title">Check-in</h1>
          <p className="guests__subtitle">
            Tap a row to flip its arrival state. Multiple devices stay in sync.
          </p>
          <p className="guests__signed-in">
            Signed in as <strong>{session.user?.email}</strong>
            {' · '}
            <a href="#guests" className="link-button">
              guest list
            </a>
            {' · '}
            <button
              type="button"
              className="link-button"
              onClick={() => adminSignOut()}
            >
              sign out
            </button>
            {' · '}
            <button type="button" className="link-button" onClick={refresh}>
              refresh
            </button>
          </p>
        </header>

        {loading && invitations.length === 0 ? (
          <section className="card card--loading">Loading the guest list…</section>
        ) : (
          <>
            <section className="guests__stats">
              <Stat
                label="Parties arrived"
                value={`${totals.arrivedParties} / ${totals.expectedParties}`}
                accent="pink"
              />
              <Stat
                label="Seats filled"
                value={`${totals.arrivedSeats} / ${totals.expectedSeats}`}
                accent="purple"
              />
              <Stat
                label="Kids on site"
                value={`${totals.arrivedKids} / ${totals.expectedKids}`}
              />
            </section>

            <section className="card guests__section">
              <div className="guests__section-head">
                <h2 className="card__title">
                  Attending guests &nbsp;
                  <span className="guests__count">
                    {filtersActive
                      ? `${filtered.length} of ${attending.length}`
                      : attending.length}
                  </span>
                </h2>
              </div>

              <div className="guests__filters">
                <input
                  type="search"
                  className="guests__search"
                  placeholder="Search name…"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                />
                <div className="guests__filter-pills" role="group" aria-label="Status">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'pending', label: 'Not arrived' },
                    { value: 'arrived', label: 'Arrived' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`pill ${filters.state === opt.value ? 'pill--on' : ''}`}
                      onClick={() =>
                        setFilters((f) => ({ ...f, state: opt.value }))
                      }
                      aria-pressed={filters.state === opt.value}
                    >
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
                <div className="guests__filter-pills" role="group" aria-label="Tags">
                  <button
                    type="button"
                    className={`pill ${filters.godparent ? 'pill--on' : ''}`}
                    onClick={() =>
                      setFilters((f) => ({ ...f, godparent: !f.godparent }))
                    }
                    aria-pressed={filters.godparent}
                  >
                    <span>💜 Godparents</span>
                  </button>
                  <button
                    type="button"
                    className={`pill ${filters.kids ? 'pill--on' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, kids: !f.kids }))}
                    aria-pressed={filters.kids}
                  >
                    <span>🌸 With kids</span>
                  </button>
                </div>
                {filtersActive && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {attending.length === 0 ? (
                <p className="guests__empty">
                  No attending guests yet. They'll appear here once their RSVP lands.
                </p>
              ) : filtered.length === 0 ? (
                <p className="guests__empty">
                  No matches.{' '}
                  <button type="button" className="link-button" onClick={clearFilters}>
                    Clear filters
                  </button>
                </p>
              ) : (
                <ul className="checkin__list">
                  {filtered.map((inv) => (
                    <li
                      key={inv.id}
                      className={`checkin__row ${inv.checked_in ? 'checkin__row--in' : ''}`}
                    >
                      <button
                        type="button"
                        className="checkin__hit"
                        onClick={() => toggle(inv)}
                        disabled={savingId === inv.id}
                        aria-pressed={inv.checked_in}
                      >
                        <div className="checkin__main">
                          <div className="checkin__name">
                            {inv.name}
                            {inv.is_godparent && (
                              <span className="checkin__tag">💜</span>
                            )}
                          </div>
                          <div className="checkin__meta">
                            {inv.rsvp_seats || 0}{' '}
                            {inv.rsvp_seats === 1 ? 'seat' : 'seats'}
                            {inv.rsvp_bringing_kids && inv.rsvp_kids_count > 0 && (
                              <>
                                {' · '}
                                {inv.rsvp_kids_count}{' '}
                                {inv.rsvp_kids_count === 1 ? 'kid' : 'kids'}
                              </>
                            )}
                            {inv.checked_in && inv.checked_in_at && (
                              <>
                                {' · arrived '}
                                {fmtTime(inv.checked_in_at)}
                              </>
                            )}
                          </div>
                        </div>
                        <div
                          className={`checkin__toggle ${inv.checked_in ? 'checkin__toggle--on' : ''}`}
                          aria-hidden="true"
                        >
                          <span className="checkin__toggle-thumb" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
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
