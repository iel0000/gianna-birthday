import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import Sparkles from './Sparkles.jsx';
import BackgroundImages from './BackgroundImages.jsx';
import {
  createInvitation,
  updateInvitation,
  deleteInvitation,
  bulkCreateInvitations,
  fetchAllInvitationsWithStatus,
  updateRsvpAsAdmin,
  deleteRsvpAsAdmin
} from '../utils/rsvpDb.js';
import { parseCsv, buildHeaderIndex } from '../utils/csv.js';
import {
  adminSignIn,
  adminSignOut,
  getAdminSession,
  onAdminAuthChange
} from '../utils/adminAuth.js';
import { isSupabaseConfigured } from '../utils/supabaseClient.js';
import { useConfirm } from './ConfirmDialog.jsx';

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

// Each row here is an invitation row joined with its rsvp data.
// `inv.seats` = seats reserved by the admin, `inv.rsvp_seats` = seats
// confirmed by the guest in their RSVP.
const RSVP_COLUMNS = [
  { label: 'Name', get: (i) => i.name },
  { label: 'Email', get: (i) => i.rsvp_email || '' },
  { label: 'Attending', get: (i) => (i.status === 'attending' ? 'Yes' : 'No') },
  { label: 'Reserved Seats', get: (i) => i.seats },
  { label: 'Confirmed Seats', get: (i) => i.rsvp_seats ?? '' },
  { label: 'Bringing Kids', get: (i) => (i.rsvp_bringing_kids ? 'Yes' : 'No') },
  { label: 'Kids Count', get: (i) => i.rsvp_kids_count ?? 0 },
  { label: 'Godparent', get: (i) => (i.is_godparent ? 'Yes' : 'No') },
  { label: 'Message', get: (i) => i.rsvp_message ?? '' },
  { label: 'Submitted At', get: (i) => i.submitted_at ?? '' }
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
  const { confirm, alert } = useConfirm();
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [dataState, setDataState] = useState({ ok: false, reason: '' });
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick((t) => t + 1);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    godparent: false,
    kids: false
  });
  const [editingRsvp, setEditingRsvp] = useState(null);

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
      setInvitations([]);
      setDataState({ ok: false, reason: '' });
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const invResult = await fetchAllInvitationsWithStatus();
      if (!cancelled) {
        setInvitations(invResult.invitations || []);
        setDataState({ ok: invResult.ok, reason: invResult.reason || '' });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, refreshTick]);

  // RSVPs view = invitations that have actually responded (status !== 'pending').
  // Source is the same invitations array used by the manager — no separate fetch.
  const respondedInvitations = useMemo(
    () => invitations.filter((i) => i.status !== 'pending'),
    [invitations]
  );

  const filteredRsvps = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return respondedInvitations.filter((i) => {
      if (q) {
        const haystack = `${i.name || ''} ${i.rsvp_email || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.status === 'attending' && i.status !== 'attending') return false;
      if (filters.status === 'declined' && i.status !== 'declined') return false;
      if (filters.godparent && !i.is_godparent) return false;
      if (filters.kids && !i.rsvp_bringing_kids) return false;
      return true;
    });
  }, [respondedInvitations, filters]);

  const filtersActive =
    filters.search ||
    filters.status !== 'all' ||
    filters.godparent ||
    filters.kids;

  const clearFilters = () =>
    setFilters({ search: '', status: 'all', godparent: false, kids: false });

  const totals = useMemo(() => {
    const responded = invitations.filter((i) => i.status !== 'pending');
    const attending = responded.filter((i) => i.status === 'attending');
    return {
      responses: responded.length,
      attending: attending.length,
      seats: attending.reduce((sum, i) => sum + (i.rsvp_seats || 0), 0),
      kids: attending.reduce(
        (sum, i) => sum + (i.rsvp_bringing_kids ? i.rsvp_kids_count || 0 : 0),
        0
      ),
      godparents: responded.filter((i) => i.is_godparent).length,
      declined: responded.length - attending.length
    };
  }, [invitations]);

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

  const handleDeleteRsvp = async (invitation) => {
    const confirmed = await confirm({
      title: `Delete ${invitation.name}'s RSVP?`,
      message:
        'The invitation row stays in place — they can still RSVP again from their link if they like.',
      confirmLabel: 'Delete RSVP',
      danger: true
    });
    if (!confirmed) return;
    const res = await deleteRsvpAsAdmin(invitation.id);
    if (!res.ok) {
      await alert({
        title: 'Could not delete',
        message: res.reason,
        danger: true
      });
      return;
    }
    refresh();
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
        ) : !dataState.ok ? (
          <section className="card">
            <h2 className="card__title">Could not load the guest list</h2>
            <p className="card__lede">
              {dataState.reason || 'Supabase is not configured for this site.'}
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
                      ? `${filteredRsvps.length} of ${respondedInvitations.length}`
                      : respondedInvitations.length}
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

              {respondedInvitations.length === 0 ? (
                <p className="guests__empty">No RSVPs yet — guests will appear here once they respond.</p>
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
                        <th className="guests__actions-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRsvps.map((i) => {
                        const attending = i.status === 'attending';
                        return (
                          <tr
                            key={i.guid}
                            className={attending ? '' : 'guests__row--declined'}
                          >
                            <td>{i.name}</td>
                            <td>
                              {i.rsvp_email ? (
                                <a href={`mailto:${i.rsvp_email}`}>{i.rsvp_email}</a>
                              ) : (
                                <span style={{ color: 'var(--purple-700)', opacity: 0.5 }}>—</span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`guests__pill ${attending ? 'guests__pill--yes' : 'guests__pill--no'}`}
                              >
                                {attending ? 'Attending' : 'Declined'}
                              </span>
                            </td>
                            <td className="guests__num">{i.rsvp_seats ?? ''}</td>
                            <td className="guests__num">
                              {i.rsvp_bringing_kids ? i.rsvp_kids_count || 0 : ''}
                            </td>
                            <td>{i.is_godparent ? '💜' : ''}</td>
                            <td className="guests__msg">{i.rsvp_message || '—'}</td>
                            <td className="guests__when">{fmtDate(i.submitted_at)}</td>
                            <td className="guests__actions">
                              <RowActions
                                items={[
                                  {
                                    icon: '✏️',
                                    label: 'Edit RSVP',
                                    onClick: () => setEditingRsvp(i)
                                  },
                                  {
                                    icon: '🗑️',
                                    label: 'Delete RSVP',
                                    onClick: () => handleDeleteRsvp(i),
                                    danger: true
                                  }
                                ]}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </>
        )}
      </main>

      {editingRsvp && (
        <EditRsvpModal
          row={editingRsvp}
          onClose={() => setEditingRsvp(null)}
          onSaved={() => {
            setEditingRsvp(null);
            refresh();
          }}
        />
      )}
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
                disabled={item.disabled}
                title={item.disabled ? item.disabledHint || '' : undefined}
                className={`row-actions__item ${item.danger ? 'row-actions__item--danger' : ''} ${item.disabled ? 'row-actions__item--disabled' : ''}`}
                onClick={() => {
                  if (item.disabled) return;
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
  const { confirm, alert } = useConfirm();
  const [name, setName] = useState('');
  const [seats, setSeats] = useState(1);
  const [isGodparent, setIsGodparent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copiedGuid, setCopiedGuid] = useState(null);
  const [qrInvitation, setQrInvitation] = useState(null);
  const [editingInvitation, setEditingInvitation] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

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
    const confirmed = await confirm({
      title: `Delete the invitation for ${inv.name}?`,
      message:
        "This can't be undone. The guest's invitation link will stop working immediately.",
      confirmLabel: 'Delete invitation',
      danger: true
    });
    if (!confirmed) return;
    const res = await deleteInvitation(inv.guid);
    if (!res.ok) {
      await alert({
        title: 'Could not delete',
        message: res.reason,
        danger: true
      });
      return;
    }
    onChanged?.();
  };

  const onImportClick = () => fileInputRef.current?.click();

  const downloadSample = () => {
    const sample =
      'Name,Seats,Godparent\n' +
      'The Cruz Family,4,No\n' +
      'Maria Garcia,2,No\n' +
      'Tito Rico Reyes,3,Yes\n' +
      '"Santos Family, Manila",5,No\n' +
      'Tita Lourdes Mendoza,1,Yes\n' +
      'Ate Joy & kids,4,No\n';
    downloadCsv('avery-invitations-template.csv', sample);
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setImportResult({
          ok: false,
          reason: 'CSV is empty or has no data rows.',
          inserted: 0,
          skipped: 0,
          errors: []
        });
        setImporting(false);
        return;
      }

      const [header, ...dataRows] = parsed;
      const idx = buildHeaderIndex(header);
      const nameCol = idx.find('name', 'guest name', 'guest');
      const seatsCol = idx.find('seats', 'seat count', 'reserved seats');
      const godparentCol = idx.find(
        'godparent',
        'is godparent',
        'is_godparent',
        'type'
      );

      if (nameCol === -1) {
        setImportResult({
          ok: false,
          reason: 'CSV must have a "Name" column.',
          inserted: 0,
          skipped: 0,
          errors: []
        });
        setImporting(false);
        return;
      }

      const isTruthy = (v) =>
        /^(yes|true|y|1|godparent|💜)$/i.test(String(v || '').trim());

      const rows = dataRows
        .filter((cells) => cells.some((c) => String(c).trim()))
        .map((cells) => ({
          name: cells[nameCol],
          seats: seatsCol >= 0 ? cells[seatsCol] : 1,
          isGodparent: godparentCol >= 0 ? isTruthy(cells[godparentCol]) : false
        }));

      const result = await bulkCreateInvitations(rows);
      setImportResult(result);
      if (result.ok || result.inserted > 0) onChanged?.();
    } catch (err) {
      console.error('[CSV import] failed', err);
      setImportResult({
        ok: false,
        reason: err?.message || 'Failed to read the CSV.',
        inserted: 0,
        skipped: 0,
        errors: []
      });
    }
    setImporting(false);
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
        <div className="guests__section-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn--ghost guests__export"
            onClick={onImportClick}
            disabled={importing}
            title="Upload a CSV with columns: Name, Seats, Godparent"
          >
            ⬆︎ &nbsp; {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className="link-button guests__sample-link"
            onClick={downloadSample}
            title="Download a sample CSV with the expected columns"
          >
            sample format
          </button>
          <button
            type="button"
            className="btn btn--primary guests__export"
            onClick={exportInvitations}
            disabled={invitations.length === 0}
          >
            ⬇︎ &nbsp; Export to CSV
          </button>
        </div>
      </div>

      {importResult && (
        <div
          className={`banner ${importResult.ok ? 'banner--ok' : 'banner--info'}`}
          role="status"
        >
          {importResult.ok ? (
            <>
              ✨ Imported <strong>{importResult.inserted}</strong>{' '}
              {importResult.inserted === 1 ? 'invitation' : 'invitations'}.
              {importResult.skipped > 0 && (
                <> Skipped {importResult.skipped} (missing name).</>
              )}
            </>
          ) : (
            <>
              <strong>Import didn't go through:</strong> {importResult.reason}
              {importResult.inserted > 0 && (
                <> ({importResult.inserted} were saved before the failure.)</>
              )}
            </>
          )}
          <button
            type="button"
            className="link-button banner__dismiss"
            onClick={() => setImportResult(null)}
          >
            dismiss
          </button>
        </div>
      )}

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
                          onClick: () => setEditingInvitation(inv),
                          disabled: inv.status !== 'pending',
                          disabledHint:
                            inv.status === 'attending'
                              ? 'Already RSVP’d — cannot edit'
                              : inv.status === 'declined'
                                ? 'Guest declined — cannot edit'
                                : ''
                        },
                        {
                          icon: '🗑️',
                          label: 'Delete',
                          onClick: () => onDelete(inv),
                          danger: true,
                          disabled: inv.status !== 'pending',
                          disabledHint:
                            inv.status === 'attending'
                              ? 'Already RSVP’d — cannot delete'
                              : inv.status === 'declined'
                                ? 'Guest declined — cannot delete'
                                : ''
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

// Admin-side RSVP editor — covers attending/declined, seats, kids,
// godparent flag, and the message. Saves via updateRsvpAsAdmin which
// keys on invitation_id.
function EditRsvpModal({ row, onClose, onSaved }) {
  const [attending, setAttending] = useState(row.status === 'attending');
  const [seats, setSeats] = useState(row.rsvp_seats ?? row.seats ?? 1);
  const [bringingKids, setBringingKids] = useState(!!row.rsvp_bringing_kids);
  const [kidsCount, setKidsCount] = useState(row.rsvp_kids_count || 1);
  const [isGodparent, setIsGodparent] = useState(!!row.is_godparent);
  const [message, setMessage] = useState(row.rsvp_message || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    setSubmitting(true);
    const res = await updateRsvpAsAdmin({
      invitationId: row.id,
      updates: {
        attending,
        seats: attending ? Math.max(1, Number(seats) || 1) : 0,
        bringingKids: attending && bringingKids,
        kidsCount: attending && bringingKids ? Math.max(1, Number(kidsCount) || 1) : 0,
        isGodparent,
        message: message.trim()
      }
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
      aria-label={`Edit RSVP for ${row.name}`}
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

        <p className="card__eyebrow">Edit RSVP</p>
        <h3 className="modal__title">For {row.name}</h3>
        {row.rsvp_email && (
          <p className="modal__sub">{row.rsvp_email}</p>
        )}

        <form className="form" onSubmit={onSubmit}>
          <fieldset className="form__field form__field--inline">
            <legend>Attending?</legend>
            <label className={`pill ${attending ? 'pill--on' : ''}`}>
              <input
                type="radio"
                checked={attending}
                onChange={() => setAttending(true)}
              />
              <span>Yes</span>
            </label>
            <label className={`pill ${!attending ? 'pill--on' : ''}`}>
              <input
                type="radio"
                checked={!attending}
                onChange={() => setAttending(false)}
              />
              <span>Declined</span>
            </label>
          </fieldset>

          {attending && (
            <>
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
                  checked={bringingKids}
                  onChange={(e) => setBringingKids(e.target.checked)}
                />
                <span className="switch__track" aria-hidden="true">
                  <span className="switch__thumb" />
                </span>
                <span className="switch__label">Bringing little ones</span>
              </label>

              {bringingKids && (
                <label className="form__field">
                  <span>How many kids?</span>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={kidsCount}
                    onChange={(e) => setKidsCount(Number(e.target.value))}
                  />
                </label>
              )}
            </>
          )}

          <label className="switch">
            <input
              type="checkbox"
              checked={isGodparent}
              onChange={(e) => setIsGodparent(e.target.checked)}
            />
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            <span className="switch__label">Mark as godparent</span>
          </label>

          <label className="form__field">
            <span>Message for Avery</span>
            <textarea
              rows="3"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
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

// Loads an image as a Promise<HTMLImageElement>. Resolves null on
// failure (the QR is rendered without a logo overlay in that case).
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Generates the QR onto an offscreen canvas, then overlays the hero
// portrait clipped to a circle in the centre. Error correction H lets
// the QR survive ~30% obstruction, so the centre logo doesn't break
// scanning. If the logo fails to load, falls back to a plain QR.
async function generateQrWithLogo(url, logoSrc) {
  const size = 480;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  await QRCode.toCanvas(canvas, url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#3d2a73',
      light: '#ffffff'
    }
  });

  const logo = logoSrc ? await loadImage(logoSrc) : null;
  if (logo) {
    const ctx = canvas.getContext('2d');
    const logoSize = Math.round(size * 0.22); // 22% of the QR keeps it readable
    const cx = size / 2;
    const cy = size / 2;
    const r = logoSize / 2;
    const ringPad = 8;

    // Solid white pad behind the logo so the QR modules around it stay
    // readable and the photo doesn't blend into the dark dots.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r + ringPad, 0, Math.PI * 2);
    ctx.fill();

    // Clip the logo to a circle.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, cx - r, cy - r, logoSize, logoSize);
    ctx.restore();

    // Pink ring around the logo to match the site's accents.
    ctx.strokeStyle = '#d94994';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  return canvas.toDataURL('image/png');
}

function QrModal({ invitation, onClose }) {
  const [dataUrl, setDataUrl] = useState('');
  const url = buildInviteUrl(invitation.guid, invitation.is_godparent);

  useEffect(() => {
    let cancelled = false;
    const logoSrc = `${import.meta.env.BASE_URL}photos/gianna-hero.jpg`;
    generateQrWithLogo(url, logoSrc)
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
