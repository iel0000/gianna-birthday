import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Sparkles from './Sparkles.jsx';
import BackgroundImages from './BackgroundImages.jsx';
import {
  createInvitation,
  updateInvitation,
  deleteInvitation,
  bulkCreateInvitations,
  fetchAllInvitationsWithStatus,
  updateRsvpAsAdmin,
  deleteRsvpAsAdmin,
  setInvitationSent
} from '../utils/rsvpDb.js';
import { parseCsv, buildHeaderIndex } from '../utils/csv.js';
import {
  adminSignIn,
  adminSignOut,
  getAdminSession,
  onAdminAuthChange
} from '../utils/adminAuth.js';
import { isSupabaseConfigured } from '../utils/supabaseClient.js';
import {
  CARD_VARIANTS,
  generateHostInvitationCard
} from '../utils/hostInvitationCard.js';
import GenericInvitationModal from './GenericInvitationModal.jsx';
import GodparentProposalModal from './GodparentProposalModal.jsx';
import ModalPortal from './ModalPortal.jsx';
import { savePng } from '../utils/savePng.js';
import Pagination, { usePagination } from './Pagination.jsx';
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

// Download name for a generated invitation card PNG.
const cardFileName = (invitation, variant) => {
  const safeName = (invitation.name || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const base = safeName.replace(/^-|-$/g, '') || invitation.guid.slice(0, 8);
  return `invitation-${base}${CARD_VARIANTS[variant].file}.png`;
};

const RSVP_PAGE_SIZE = 20;
const INVITATION_PAGE_SIZE = 20;

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

  // Applies a change to one row in place. Cheaper than a full refetch for
  // single-field toggles, and keeps `invitations` the only source of truth.
  const patchInvitation = (guid, patch) =>
    setInvitations((prev) =>
      prev.map((inv) => (inv.guid === guid ? { ...inv, ...patch } : inv))
    );
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    godparent: 'all',
    kids: false
  });
  const [editingRsvp, setEditingRsvp] = useState(null);
  const [viewingMessage, setViewingMessage] = useState(null);

  // Supabase re-emits auth events (TOKEN_REFRESHED / SIGNED_IN) whenever the
  // tab regains focus, each with a new session object. Keying the data fetch
  // on the user id instead of that object keeps those no-op events from
  // re-running it — a fresh object identity is not a new login.
  const sessionUserId = session?.user?.id ?? null;

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
    if (!sessionUserId) {
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
  }, [sessionUserId, refreshTick]);

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
      if (filters.godparent === 'yes' && !i.is_godparent) return false;
      if (filters.godparent === 'no' && i.is_godparent) return false;
      if (filters.kids && !i.rsvp_bringing_kids) return false;
      return true;
    });
  }, [respondedInvitations, filters]);

  const rsvpPages = usePagination(filteredRsvps, {
    pageSize: RSVP_PAGE_SIZE,
    resetKey: JSON.stringify(filters)
  });

  const filtersActive =
    filters.search ||
    filters.status !== 'all' ||
    filters.godparent !== 'all' ||
    filters.kids;

  const clearFilters = () =>
    setFilters({ search: '', status: 'all', godparent: 'all', kids: false });

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

      <main className="page__main guests" aria-busy={loading}>
        <header className="guests__header">
          <p className="card__eyebrow">Host view</p>
          <h1 className="guests__title">Guest list</h1>
          <p className="guests__subtitle">
            Live data from Supabase — refreshes when you reload the page.
          </p>
          <p className="guests__signed-in">
            Signed in as <strong>{session.user?.email}</strong>
            {' · '}
            <a href="#checkin" className="link-button">
              attendance
            </a>
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

        {loading && invitations.length === 0 ? (
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
              onPatch={patchInvitation}
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
                    className={`pill ${filters.godparent === 'yes' ? 'pill--on' : ''}`}
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        godparent: f.godparent === 'yes' ? 'all' : 'yes'
                      }))
                    }
                    aria-pressed={filters.godparent === 'yes'}
                  >
                    <span>💜 Godparents</span>
                  </button>
                  <button
                    type="button"
                    className={`pill ${filters.godparent === 'no' ? 'pill--on' : ''}`}
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        godparent: f.godparent === 'no' ? 'all' : 'no'
                      }))
                    }
                    aria-pressed={filters.godparent === 'no'}
                  >
                    <span>Non-godparents</span>
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
                      {rsvpPages.pageItems.map((i) => {
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
                            <td className="guests__msg">
                              {i.rsvp_message ? (
                                <button
                                  type="button"
                                  className="msg-button"
                                  onClick={() => setViewingMessage(i)}
                                  title={`Read ${i.name}'s message`}
                                  aria-label={`Read ${i.name}'s message`}
                                >
                                  💬
                                </button>
                              ) : (
                                <span className="guests__msg-empty">—</span>
                              )}
                            </td>
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

              <Pagination
                page={rsvpPages.page}
                pageCount={rsvpPages.pageCount}
                from={rsvpPages.from}
                to={rsvpPages.to}
                total={rsvpPages.total}
                label="RSVP pages"
                onPage={rsvpPages.setPage}
              />
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

      {viewingMessage && (
        <MessageModal
          row={viewingMessage}
          onClose={() => setViewingMessage(null)}
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

function InvitationManager({ invitations, onChanged, onPatch }) {
  const { confirm, alert } = useConfirm();
  const [name, setName] = useState('');
  const [seats, setSeats] = useState(1);
  const [isGodparent, setIsGodparent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copiedGuid, setCopiedGuid] = useState(null);
  const [qrInvitation, setQrInvitation] = useState(null);
  const [showProposal, setShowProposal] = useState(false);
  const [showGeneric, setShowGeneric] = useState(false);
  const [editingInvitation, setEditingInvitation] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    godparent: 'all',
    sent: 'all'
  });
  const [selected, setSelected] = useState(() => new Set());
  const [savingSent, setSavingSent] = useState(null);
  const [bulkExport, setBulkExport] = useState(null);
  const fileInputRef = useRef(null);

  const totalInvitations = invitations.length;

  const filteredInvitations = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return invitations.filter((inv) => {
      if (q && !(inv.name || '').toLowerCase().includes(q)) return false;
      if (filters.status !== 'all' && inv.status !== filters.status) return false;
      if (filters.godparent === 'yes' && !inv.is_godparent) return false;
      if (filters.godparent === 'no' && inv.is_godparent) return false;
      if (filters.sent === 'yes' && !inv.invitation_sent) return false;
      if (filters.sent === 'no' && inv.invitation_sent) return false;
      return true;
    });
  }, [invitations, filters]);

  // Selection is keyed on guid so it survives a refetch. Rows hidden by a
  // filter stay selected — the count and the export both say how many.
  const selectedInvitations = useMemo(
    () => invitations.filter((inv) => selected.has(inv.guid)),
    [invitations, selected]
  );

  const allFilteredSelected =
    filteredInvitations.length > 0 &&
    filteredInvitations.every((inv) => selected.has(inv.guid));

  const toggleRow = (guid) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) {
        next.delete(guid);
      } else {
        next.add(guid);
      }
      return next;
    });

  const toggleAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      filteredInvitations.forEach((inv) => {
        if (allFilteredSelected) {
          next.delete(inv.guid);
        } else {
          next.add(inv.guid);
        }
      });
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  // Optimistic flip; on failure we put the old value back and say so.
  const toggleSent = async (invitation) => {
    if (savingSent) return;
    const next = !invitation.invitation_sent;
    setSavingSent(invitation.guid);
    onPatch?.(invitation.guid, {
      invitation_sent: next,
      invitation_sent_at: next ? new Date().toISOString() : null
    });

    const res = await setInvitationSent({ guid: invitation.guid, sent: next });
    setSavingSent(null);
    if (!res.ok) {
      onPatch?.(invitation.guid, {
        invitation_sent: invitation.invitation_sent,
        invitation_sent_at: invitation.invitation_sent_at
      });
      alert({
        title: 'Could not save that',
        message: res.reason || 'The invitation-sent flag did not stick.'
      });
    }
  };

  const filtersActive =
    filters.search ||
    filters.status !== 'all' ||
    filters.godparent !== 'all' ||
    filters.sent !== 'all';

  const clearFilters = () =>
    setFilters({ search: '', status: 'all', godparent: 'all', sent: 'all' });

  const invitationPages = usePagination(filteredInvitations, {
    pageSize: INVITATION_PAGE_SIZE,
    resetKey: JSON.stringify(filters)
  });

  // Seat total follows the filter, so "Godparents only" shows their seats.
  const totalInvitationSeats = useMemo(
    () => filteredInvitations.reduce((sum, inv) => sum + (inv.seats || 0), 0),
    [filteredInvitations]
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
    const url = buildInviteUrl(inv.guid);
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
        /^(yes|true|y|1|godparent|ninong|ninang|💜)$/i.test(String(v || '').trim());

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
      { label: 'Invitation Sent', get: (i) => (i.invitation_sent ? 'Yes' : 'No') },
      { label: 'Sent At', get: (i) => i.invitation_sent_at || '' },
      { label: 'Status', get: (i) => i.status },
      { label: 'RSVP Seats', get: (i) => i.rsvp_seats ?? '' },
      { label: 'Bringing Kids', get: (i) => (i.rsvp_bringing_kids ? 'Yes' : 'No') },
      { label: 'Kids Count', get: (i) => i.rsvp_kids_count ?? 0 },
      { label: 'Message', get: (i) => i.rsvp_message || '' },
      { label: 'Submitted At', get: (i) => i.submitted_at || '' },
      { label: 'Invite URL', get: (i) => buildInviteUrl(i.guid) }
    ];
    downloadCsv(`avery-invitations-${stamp}.csv`, toCsv(filteredInvitations, cols));
  };

  return (
    <section className="card guests__section">
      <div className="guests__section-head">
        <h2 className="card__title">
          Invitations &nbsp;
          <span className="guests__count">
            {filtersActive
              ? `${filteredInvitations.length} of ${totalInvitations}`
              : totalInvitations}
          </span>
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
            onClick={() => setBulkExport(selectedInvitations)}
            disabled={selectedInvitations.length === 0}
            title="Generate an invitation card PNG for each selected guest"
          >
            🖼️ &nbsp; Export {selectedInvitations.length || ''} card
            {selectedInvitations.length === 1 ? '' : 's'}
          </button>
          <button
            type="button"
            className="btn btn--ghost guests__export"
            onClick={() => setShowGeneric(true)}
            title="A card with no name or seat count — safe to post anywhere"
          >
            ✨ &nbsp; Invitation card
          </button>
          <button
            type="button"
            className="btn btn--ghost guests__export"
            onClick={() => setShowProposal(true)}
            title="Download the shareable “Will you be my Ninong/Ninang?” card"
          >
            💜 &nbsp; Godparent proposal
          </button>
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
            disabled={filteredInvitations.length === 0}
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

      {invitations.length > 0 && (
        <div className="guests__filters">
          <input
            type="search"
            className="guests__search"
            placeholder="Search name…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          <div className="guests__filter-pills" role="group" aria-label="Status">
            {[
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'attending', label: 'Attending' },
              { value: 'declined', label: 'Declined' }
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`pill ${filters.status === opt.value ? 'pill--on' : ''}`}
                onClick={() => setFilters((f) => ({ ...f, status: opt.value }))}
                aria-pressed={filters.status === opt.value}
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="guests__filter-pills" role="group" aria-label="Tags">
            <button
              type="button"
              className={`pill ${filters.godparent === 'yes' ? 'pill--on' : ''}`}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  godparent: f.godparent === 'yes' ? 'all' : 'yes'
                }))
              }
              aria-pressed={filters.godparent === 'yes'}
            >
              <span>💜 Godparents</span>
            </button>
            <button
              type="button"
              className={`pill ${filters.godparent === 'no' ? 'pill--on' : ''}`}
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  godparent: f.godparent === 'no' ? 'all' : 'no'
                }))
              }
              aria-pressed={filters.godparent === 'no'}
            >
              <span>Non-godparents</span>
            </button>
            <button
              type="button"
              className={`pill ${filters.sent === 'yes' ? 'pill--on' : ''}`}
              onClick={() =>
                setFilters((f) => ({ ...f, sent: f.sent === 'yes' ? 'all' : 'yes' }))
              }
              aria-pressed={filters.sent === 'yes'}
            >
              <span>✉️ Sent</span>
            </button>
            <button
              type="button"
              className={`pill ${filters.sent === 'no' ? 'pill--on' : ''}`}
              onClick={() =>
                setFilters((f) => ({ ...f, sent: f.sent === 'no' ? 'all' : 'no' }))
              }
              aria-pressed={filters.sent === 'no'}
            >
              <span>Not sent</span>
            </button>
          </div>
          {filtersActive && (
            <button type="button" className="link-button" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {selectedInvitations.length > 0 && (
        <p className="guests__selection" role="status">
          <strong>{selectedInvitations.length}</strong>{' '}
          {selectedInvitations.length === 1 ? 'invitation' : 'invitations'} selected{' '}
          <button type="button" className="link-button" onClick={clearSelection}>
            clear
          </button>
        </p>
      )}

      {invitations.length === 0 ? (
        <p className="guests__empty">No invitations yet. Add one above to generate a link.</p>
      ) : filteredInvitations.length === 0 ? (
        <p className="guests__empty">
          No invitations match the current filters.{' '}
          <button type="button" className="link-button" onClick={clearFilters}>
            Clear filters
          </button>
        </p>
      ) : (
        <div className="guests__table-wrap">
          <table className="guests__table">
            <thead>
              <tr>
                <th className="guests__select-col">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    aria-label={
                      allFilteredSelected
                        ? 'Deselect all shown invitations'
                        : 'Select all shown invitations'
                    }
                  />
                </th>
                <th>Name</th>
                <th>Seats</th>
                <th>Type</th>
                <th>Sent</th>
                <th>Status</th>
                <th>Submitted</th>
                <th className="guests__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitationPages.pageItems.map((inv) => (
                <tr
                  key={inv.guid}
                  className={selected.has(inv.guid) ? 'guests__row--selected' : ''}
                >
                  <td className="guests__select-col">
                    <input
                      type="checkbox"
                      checked={selected.has(inv.guid)}
                      onChange={() => toggleRow(inv.guid)}
                      aria-label={`Select ${inv.name}`}
                    />
                  </td>
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
                    <button
                      type="button"
                      className={`sent-toggle ${inv.invitation_sent ? 'sent-toggle--on' : ''}`}
                      onClick={() => toggleSent(inv)}
                      disabled={savingSent === inv.guid}
                      aria-pressed={!!inv.invitation_sent}
                      title={
                        inv.invitation_sent
                          ? `Sent${inv.invitation_sent_at ? ` · ${fmtDate(inv.invitation_sent_at)}` : ''} — click to undo`
                          : 'Mark this invitation as sent'
                      }
                    >
                      {inv.invitation_sent ? '✓ Sent' : 'Mark sent'}
                    </button>
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
                          label: 'Invitation card',
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

      <Pagination
        page={invitationPages.page}
        pageCount={invitationPages.pageCount}
        from={invitationPages.from}
        to={invitationPages.to}
        total={invitationPages.total}
        label="Invitation pages"
        onPage={invitationPages.setPage}
      />

      {qrInvitation && (
        <HostCardModal
          invitation={qrInvitation}
          onClose={() => setQrInvitation(null)}
        />
      )}

      {showGeneric && (
        <GenericInvitationModal onClose={() => setShowGeneric(false)} />
      )}

      {showProposal && (
        <GodparentProposalModal onClose={() => setShowProposal(false)} />
      )}

      {bulkExport && (
        <BulkCardExportModal
          invitations={bulkExport}
          onClose={() => setBulkExport(null)}
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
// Read-only view of a guest's message. The RSVPs table shows an icon
// instead of the text — a long blessing stretched the row out of shape and
// pushed the rest of the columns off-screen.
function MessageModal({ row, onClose }) {
  return (
    <ModalPortal label={`Message from ${row.name}`} onClose={onClose}>
      <p className="card__eyebrow">A message for Avery</p>
      <h3 className="modal__title">{row.name}</h3>
      <p className="modal__sub">
        {row.rsvp_email || 'No email given'} · {fmtDate(row.submitted_at)}
      </p>

      <blockquote className="message-modal__quote">{row.rsvp_message}</blockquote>

      <div className="modal__actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalPortal>
  );
}

function EditRsvpModal({ row, onClose, onSaved }) {
  const [attending, setAttending] = useState(row.status === 'attending');
  const [seats, setSeats] = useState(row.rsvp_seats ?? row.seats ?? 1);
  const [bringingKids, setBringingKids] = useState(!!row.rsvp_bringing_kids);
  const [kidsCount, setKidsCount] = useState(row.rsvp_kids_count || 1);
  const [isGodparent, setIsGodparent] = useState(!!row.is_godparent);
  const [message, setMessage] = useState(row.rsvp_message || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    <ModalPortal
      label={`Edit RSVP for ${row.name}`}
      onClose={onClose}
      busy={submitting}
    >
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
    </ModalPortal>
  );
}

function EditInvitationModal({ invitation, onClose, onSaved }) {
  const [name, setName] = useState(invitation.name);
  const [seats, setSeats] = useState(invitation.seats);
  const [isGodparent, setIsGodparent] = useState(!!invitation.is_godparent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    <ModalPortal
      label={`Edit invitation for ${invitation.name}`}
      onClose={onClose}
      busy={submitting}
    >
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
    </ModalPortal>
  );
}

const VARIANT_KEYS = Object.keys(CARD_VARIANTS);

const VARIANT_HINTS = {
  qr: 'Message, reserved seats, and the QR that opens their RSVP.',
  guided:
    'Adds numbered camera instructions above the QR — for a guest with a smartphone who has never scanned a code.',
  simple:
    'No QR, no link, nothing to tap. Their seats are reserved and the card says so — for a guest who will not RSVP online at all.'
};

// Bulk card export. Cards are drawn and downloaded one at a time — the
// browser asks once for permission to save multiple files, then the rest
// follow. No zip, so nothing to unpack before forwarding a guest's card.
function BulkCardExportModal({ invitations, onClose }) {
  const [variant, setVariant] = useState('qr');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(0);

  const running = progress !== null;

  const runExport = async () => {
    setError('');
    setDone(0);
    setProgress({ step: 0, zipping: false });
    const portraitSrc = `${import.meta.env.BASE_URL}photos/gianna-hero.jpg`;

    try {
      // Loaded on demand — jszip is a host-only tool, and a dynamic import
      // keeps it out of the bundle every guest downloads.
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();

      for (let i = 0; i < invitations.length; i += 1) {
        const invitation = invitations[i];
        setProgress({ step: i + 1, zipping: false });
        const dataUrl = await generateHostInvitationCard({
          invitation,
          url: buildInviteUrl(invitation.guid),
          portraitSrc,
          variant
        });
        // PNGs are already compressed, so the zip stores them as-is.
        zip.file(cardFileName(invitation, variant), dataUrl.split(',')[1], {
          base64: true
        });
      }

      setProgress({ step: invitations.length, zipping: true });
      const blob = await zip.generateAsync({ type: 'blob' });

      const stamp = new Date().toISOString().slice(0, 10);
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `avery-invitation-cards-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Deferred — revoking immediately can cancel a large download before
      // the browser has finished reading the blob.
      setTimeout(() => URL.revokeObjectURL(href), 60_000);

      setDone(invitations.length);
    } catch (err) {
      console.error('[invitation card] bulk export failed', err);
      setError(err?.message || 'Could not build the zip.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <ModalPortal
      label="Export invitation cards"
      innerClassName="card-modal"
      onClose={onClose}
      busy={running}
    >
      <p className="card__eyebrow">Bulk export</p>
      <h3 className="modal__title">
        {invitations.length} invitation {invitations.length === 1 ? 'card' : 'cards'}
      </h3>
      <p className="modal__sub">
        Saved as a single zip — one PNG per guest inside, named after them.
      </p>

      <div className="modal__choices" role="group" aria-label="Card style">
        {VARIANT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`pill ${variant === key ? 'pill--on' : ''}`}
            onClick={() => setVariant(key)}
            aria-pressed={variant === key}
            disabled={running}
          >
            {CARD_VARIANTS[key].label}
          </button>
        ))}
      </div>
      <p className="modal__hint">{VARIANT_HINTS[variant]}</p>

      {error && (
        <div className="form__error" role="alert">
          {error}
        </div>
      )}

      {running ? (
        <p className="modal__hint" role="status">
          {progress.zipping
            ? 'Zipping…'
            : `Drawing ${progress.step} of ${invitations.length}…`}
        </p>
      ) : (
        done > 0 && (
          <p className="modal__hint" role="status">
            ✨ Saved a zip with {done} {done === 1 ? 'card' : 'cards'} to your
            downloads.
          </p>
        )
      )}

      <div className="modal__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={runExport}
          disabled={running}
        >
          ⬇︎ &nbsp; {running ? 'Exporting…' : 'Download zip'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onClose}
          disabled={running}
        >
          Close
        </button>
      </div>
    </ModalPortal>
  );
}

function HostCardModal({ invitation, onClose }) {
  const [variant, setVariant] = useState('qr');
  const [cards, setCards] = useState({});
  const [error, setError] = useState('');
  const url = buildInviteUrl(invitation.guid);

  // Only the visible variant is drawn — the QR ones are not free, and the
  // host usually sends a guest just one of the three.
  useEffect(() => {
    if (cards[variant]) return;
    let cancelled = false;
    const portraitSrc = `${import.meta.env.BASE_URL}photos/gianna-hero.jpg`;
    generateHostInvitationCard({ invitation, url, portraitSrc, variant })
      .then((d) => {
        if (!cancelled) setCards((prev) => ({ ...prev, [variant]: d }));
      })
      .catch((err) => {
        console.error('[invitation card] generation failed', err);
        if (!cancelled) setError(err?.message || 'Could not draw the card.');
      });
    return () => {
      cancelled = true;
    };
  }, [invitation, url, variant, cards]);

  const dataUrl = cards[variant];

  const download = () =>
    dataUrl &&
    savePng({
      dataUrl,
      filename: cardFileName(invitation, variant),
      shareTitle: `Invitation for ${invitation.name}`
    });

  return (
    <ModalPortal
      label={`Invitation card for ${invitation.name}`}
      onClose={onClose}
    >
      <p className="card__eyebrow">Invitation card</p>
      <h3 className="modal__title">For {invitation.name}</h3>
      <p className="modal__sub">
        {invitation.seats} {invitation.seats === 1 ? 'seat' : 'seats'} reserved
        {invitation.is_godparent ? ' · Godparent' : ''} · send this image to your guest
      </p>

      <div className="modal__choices" role="group" aria-label="Card style">
        {VARIANT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`pill ${variant === key ? 'pill--on' : ''}`}
            onClick={() => setVariant(key)}
            aria-pressed={variant === key}
          >
            {CARD_VARIANTS[key].label}
          </button>
        ))}
      </div>
      <p className="modal__hint">{VARIANT_HINTS[variant]}</p>

      <div className="modal__qr">
        {error ? (
          <p className="modal__loading">{error}</p>
        ) : dataUrl ? (
          <img
            src={dataUrl}
            alt={`${CARD_VARIANTS[variant].label} invitation card for ${invitation.name}`}
          />
        ) : (
          <p className="modal__loading">Drawing fairy dust…</p>
        )}
      </div>

      {variant !== 'simple' && (
        <p className="modal__url" title={url}>{url}</p>
      )}

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
    </ModalPortal>
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
