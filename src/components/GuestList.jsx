import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import Sparkles from './Sparkles.jsx';
import BackgroundImages from './BackgroundImages.jsx';
import {
  fetchAllRsvps,
  createInvitation,
  updateInvitation,
  deleteInvitation,
  fetchAllInvitationsWithStatus
} from '../utils/rsvpDb.js';
import {
  adminSignIn,
  adminSignOut,
  getAdminSession,
  onAdminAuthChange
} from '../utils/adminAuth.js';
import { isSupabaseConfigured } from '../utils/supabaseClient.js';

// Universal invitation URL — godparent vs regular is determined entirely
// by the invitation row in the database, not the URL. Same shape for everyone.
const buildInviteUrl = (guid) => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin + window.location.pathname;
  return `${origin}?invite=${guid}`;
};

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
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick((t) => t + 1);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    godparent: false,
    kids: false
  });

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
      setInvitations([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [rsvpResult, invResult] = await Promise.all([
        fetchAllRsvps(),
        fetchAllInvitationsWithStatus()
      ]);
      if (!cancelled) {
        setData(rsvpResult);
        setInvitations(invResult.invitations || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, refreshTick]);

  const filteredRsvps = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return data.rsvps.filter((r) => {
      if (q) {
        const haystack = `${r.name || ''} ${r.email || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.status === 'attending' && !r.attending) return false;
      if (filters.status === 'declined' && r.attending) return false;
      if (filters.godparent && !r.is_godparent) return false;
      if (filters.kids && !r.bringing_kids) return false;
      return true;
    });
  }, [data.rsvps, filters]);

  const filtersActive =
    filters.search ||
    filters.status !== 'all' ||
    filters.godparent ||
    filters.kids;

  const clearFilters = () =>
    setFilters({ search: '', status: 'all', godparent: false, kids: false });

  const totals = useMemo(() => {
    const yes = data.rsvps.filter((r) => r.attending);
    return {
      responses: data.rsvps.length,
      attending: yes.length,
      seats: yes.reduce((sum, r) => sum + (r.seats || 0), 0),
      kids: yes.reduce((sum, r) => sum + (r.bringing_kids ? r.kids_count || 0 : 0), 0),
      // Pulled directly from rsvps.is_godparent — the source of truth now
      // that the godparent answer is captured during the RSVP itself.
      godparents: data.rsvps.filter((r) => r.is_godparent).length,
      declined: data.rsvps.length - yes.length
    };
  }, [data]);

  const exportRsvps = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`avery-rsvps-${stamp}.csv`, toCsv(filteredRsvps, RSVP_COLUMNS));
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
              <Stat label="Invitations" value={invitations.length} />
              <Stat label="Responses" value={totals.responses} />
              <Stat label="Attending" value={totals.attending} accent="pink" />
              <Stat label="Seats" value={totals.seats} accent="purple" />
              <Stat label="Kids" value={totals.kids} />
              <Stat label="Declined" value={totals.declined} />
              <Stat label="Godparents" value={totals.godparents} accent="gold" />
            </section>

            <InvitationManager
              invitations={invitations}
              onChanged={refresh}
            />


            <section className="card guests__section">
              <div className="guests__section-head">
                <h2 className="card__title">
                  RSVPs &nbsp;
                  <span className="guests__count">
                    {filtersActive
                      ? `${filteredRsvps.length} of ${data.rsvps.length}`
                      : data.rsvps.length}
                  </span>
                </h2>
                <button
                  type="button"
                  className="btn btn--primary guests__export"
                  onClick={exportRsvps}
                  disabled={filteredRsvps.length === 0}
                >
                  ⬇︎ &nbsp; Export RSVPs to CSV
                </button>
              </div>

              <div className="guests__filters">
                <input
                  type="search"
                  className="guests__search"
                  placeholder="Search name or email…"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                />
                <div className="guests__filter-pills" role="group" aria-label="Status">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'attending', label: 'Attending' },
                    { value: 'declined', label: 'Declined' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`pill ${filters.status === opt.value ? 'pill--on' : ''}`}
                      onClick={() =>
                        setFilters((f) => ({ ...f, status: opt.value }))
                      }
                      aria-pressed={filters.status === opt.value}
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
                    <span>🌸 Bringing kids</span>
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

              {data.rsvps.length === 0 ? (
                <p className="guests__empty">No RSVPs yet.</p>
              ) : filteredRsvps.length === 0 ? (
                <p className="guests__empty">
                  No RSVPs match the current filters.{' '}
                  <button type="button" className="link-button" onClick={clearFilters}>
                    Clear filters
                  </button>
                </p>
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
                      {filteredRsvps.map((r) => (
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

          </>
        )}
      </main>
    </div>
  );
}

// Compact row-action icon button that pops out a small menu.
// Renders the menu through a portal at document.body so it isn't clipped
// by the table's overflow-x:auto wrapper.
function RowActions({ items }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const positionMenu = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    // Anchor the right edge of the menu to the right edge of the toggle.
    const menuWidth = 200;
    const top = rect.bottom + 6;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8
    );
    setCoords({ top, left });
  };

  const handleToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    positionMenu();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (
        !buttonRef.current?.contains(e.target) &&
        !menuRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="row-actions__toggle"
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Row actions"
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="row-actions__menu"
            style={{ top: coords.top, left: coords.left }}
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={`row-actions__item ${item.danger ? 'row-actions__item--danger' : ''}`}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
              >
                {item.icon && (
                  <span className="row-actions__icon" aria-hidden="true">{item.icon}</span>
                )}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
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

function InvitationManager({ invitations, onChanged }) {
  const [name, setName] = useState('');
  const [seats, setSeats] = useState(1);
  const [isGodparent, setIsGodparent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copiedGuid, setCopiedGuid] = useState(null);
  const [qrInvitation, setQrInvitation] = useState(null);
  const [editingInvitation, setEditingInvitation] = useState(null);

  const totalInvitations = invitations.length;
  const totalInvitationSeats = useMemo(
    () => invitations.reduce((sum, inv) => sum + (inv.seats || 0), 0),
    [invitations]
  );

  const onCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Please enter the guest name.');
      return;
    }
    setSubmitting(true);
    const res = await createInvitation({ name, seats, isGodparent });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setName('');
    setSeats(1);
    setIsGodparent(false);
    onChanged?.();
  };

  const onCopy = async (inv) => {
    const url = buildInviteUrl(inv.guid, inv.is_godparent);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedGuid(inv.guid);
      setTimeout(() => setCopiedGuid((g) => (g === inv.guid ? null : g)), 1800);
    } catch {
      window.prompt('Copy this URL:', url);
    }
  };

  const onDelete = async (inv) => {
    if (!window.confirm(`Delete the invitation for ${inv.name}? This can't be undone.`)) return;
    const res = await deleteInvitation(inv.guid);
    if (!res.ok) {
      window.alert(`Could not delete: ${res.reason}`);
      return;
    }
    onChanged?.();
  };

  const exportInvitations = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const cols = [
      { label: 'Name', get: (i) => i.name },
      { label: 'Seats', get: (i) => i.seats },
      { label: 'Godparent', get: (i) => (i.is_godparent ? 'Yes' : 'No') },
      { label: 'Status', get: (i) => i.status },
      { label: 'RSVP Seats', get: (i) => i.rsvp_seats ?? '' },
      { label: 'Bringing Kids', get: (i) => (i.rsvp_bringing_kids ? 'Yes' : 'No') },
      { label: 'Kids Count', get: (i) => i.rsvp_kids_count ?? 0 },
      { label: 'Message', get: (i) => i.rsvp_message || '' },
      { label: 'Submitted At', get: (i) => i.submitted_at || '' },
      { label: 'Invite URL', get: (i) => buildInviteUrl(i.guid, i.is_godparent) }
    ];
    downloadCsv(`avery-invitations-${stamp}.csv`, toCsv(invitations, cols));
  };

  return (
    <section className="card guests__section">
      <div className="guests__section-head">
        <h2 className="card__title">
          Invitations &nbsp;
          <span className="guests__count">{totalInvitations}</span>
          {totalInvitationSeats > 0 && (
            <span className="guests__count">{totalInvitationSeats} seats reserved</span>
          )}
        </h2>
        <button
          type="button"
          className="btn btn--primary guests__export"
          onClick={exportInvitations}
          disabled={invitations.length === 0}
        >
          ⬇︎ &nbsp; Export to CSV
        </button>
      </div>

      <form className="form invitation-form" onSubmit={onCreate}>
        <div className="invitation-form__row">
          <label className="form__field invitation-form__name">
            <span>Guest name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Cruz family"
              required
            />
          </label>
          <label className="form__field invitation-form__seats">
            <span>Seats</span>
            <input
              type="number"
              min="1"
              max="12"
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="switch invitation-form__godparent">
          <input
            type="checkbox"
            checked={isGodparent}
            onChange={(e) => setIsGodparent(e.target.checked)}
          />
          <span className="switch__track" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
          <span className="switch__label">Mark as godparent invitation</span>
        </label>

        {error && <div className="form__error" role="alert">{error}</div>}

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Adding…' : '+ Add invitation'}
        </button>
      </form>

      {invitations.length === 0 ? (
        <p className="guests__empty">No invitations yet. Add one above to generate a link.</p>
      ) : (
        <div className="guests__table-wrap">
          <table className="guests__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Seats</th>
                <th>Type</th>
                <th>Status</th>
                <th>Submitted</th>
                <th className="guests__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.guid}>
                  <td>{inv.name}</td>
                  <td className="guests__num">{inv.seats}</td>
                  <td>
                    {inv.is_godparent ? (
                      <span className="guests__pill guests__pill--gold">💜 Godparent</span>
                    ) : (
                      <span className="guests__pill guests__pill--no">Guest</span>
                    )}
                  </td>
                  <td>
                    <span className={`guests__pill guests__pill--${inv.status}`}>
                      {inv.status === 'pending'
                        ? 'Pending'
                        : inv.status === 'attending'
                          ? 'Attending'
                          : 'Declined'}
                    </span>
                  </td>
                  <td className="guests__when">{fmtDate(inv.submitted_at)}</td>
                  <td className="guests__actions">
                    <RowActions
                      items={[
                        {
                          icon: copiedGuid === inv.guid ? '✓' : '📋',
                          label: copiedGuid === inv.guid ? 'Copied!' : 'Copy URL',
                          onClick: () => onCopy(inv)
                        },
                        {
                          icon: '📱',
                          label: 'QR code',
                          onClick: () => setQrInvitation(inv)
                        },
                        {
                          icon: '✏️',
                          label: 'Edit',
                          onClick: () => setEditingInvitation(inv)
                        },
                        {
                          icon: '🗑️',
                          label: 'Delete',
                          onClick: () => onDelete(inv),
                          danger: true
                        }
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {qrInvitation && (
        <QrModal
          invitation={qrInvitation}
          onClose={() => setQrInvitation(null)}
        />
      )}

      {editingInvitation && (
        <EditInvitationModal
          invitation={editingInvitation}
          onClose={() => setEditingInvitation(null)}
          onSaved={() => {
            setEditingInvitation(null);
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

function EditInvitationModal({ invitation, onClose, onSaved }) {
  const [name, setName] = useState(invitation.name);
  const [seats, setSeats] = useState(invitation.seats);
  const [isGodparent, setIsGodparent] = useState(!!invitation.is_godparent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Please enter the guest name.');
      return;
    }
    setSubmitting(true);
    const res = await updateInvitation({
      guid: invitation.guid,
      name,
      seats,
      isGodparent
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    onSaved?.();
  };

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit invitation for ${invitation.name}`}
      onClick={() => !submitting && onClose()}
    >
      <div className="modal__inner" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Close"
          disabled={submitting}
        >
          ×
        </button>

        <p className="card__eyebrow">Edit invitation</p>
        <h3 className="modal__title">For {invitation.name}</h3>

        <form className="form" onSubmit={onSubmit}>
          <label className="form__field">
            <span>Guest name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="form__field">
            <span>Seats</span>
            <input
              type="number"
              min="1"
              max="12"
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
            />
          </label>

          <label className="switch">
            <input
              type="checkbox"
              checked={isGodparent}
              onChange={(e) => setIsGodparent(e.target.checked)}
            />
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            <span className="switch__label">Mark as godparent invitation</span>
          </label>

          {error && (
            <div className="form__error" role="alert">
              {error}
            </div>
          )}

          <div className="modal__actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QrModal({ invitation, onClose }) {
  const [dataUrl, setDataUrl] = useState('');
  const url = buildInviteUrl(invitation.guid, invitation.is_godparent);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#3d2a73', // --purple-900
        light: '#ffffff'
      }
    })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch((err) => {
        console.error('[QR] generation failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    const safeName = invitation.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = `invitation-${safeName || invitation.guid.slice(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={`QR code for ${invitation.name}`}
      onClick={onClose}
    >
      <div className="modal__inner" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <p className="card__eyebrow">Invitation QR</p>
        <h3 className="modal__title">For {invitation.name}</h3>
        <p className="modal__sub">
          {invitation.seats} {invitation.seats === 1 ? 'seat' : 'seats'} reserved
          {invitation.is_godparent ? ' · Godparent' : ''}
        </p>

        <div className="modal__qr">
          {dataUrl ? (
            <img src={dataUrl} alt={`QR code linking to ${url}`} />
          ) : (
            <p className="modal__loading">Drawing fairy dust…</p>
          )}
        </div>

        <p className="modal__url" title={url}>{url}</p>

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={download}
            disabled={!dataUrl}
          >
            ⬇︎ &nbsp; Download PNG
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
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
