import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearSession,
  findUser,
  getSession,
  saveSession,
  upsertUser
} from '../utils/storage.js';
import { isValidEmail } from '../utils/validators.js';
import { fetchInvitation } from '../utils/rsvpDb.js';

const AuthContext = createContext(null);

const parseSeats = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(Math.floor(n), 12);
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [pendingReservedSeats, setPendingReservedSeats] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let session = getSession();
      let reservedSeats = null;

      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);

        // Returning guest link: ?rsvp=email — match an existing user and restore session.
        const rsvpEmail = params.get('rsvp');
        if (rsvpEmail) {
          const matchedUser = findUser(rsvpEmail);
          if (matchedUser) {
            saveSession(matchedUser);
            session = matchedUser;
          }
          params.delete('rsvp');
        }

        // Personalised invitation link: ?invite=<GUID>
        // The new primary flow — fetch the invitation row from the database
        // and seed the session with name + reserved seats from there.
        const inviteGuid = params.get('invite');
        if (inviteGuid) {
          const invitation = await fetchInvitation(inviteGuid);
          if (cancelled) return;
          if (invitation) {
            const profile = upsertUser({
              name: invitation.name,
              email: session?.email || '',
              invitation,
              reservedSeats: invitation.seats,
              createdAt: session?.createdAt || new Date().toISOString()
            });
            saveSession(profile);
            session = profile;
          }
          params.delete('invite');
        }

        // Legacy ?seats=N path — held for guests who got an old-style link.
        const seatParam = parseSeats(params.get('seats'));
        if (seatParam) {
          if (session) {
            const updated = upsertUser({ ...session, reservedSeats: seatParam });
            saveSession(updated);
            session = updated;
          } else {
            reservedSeats = seatParam;
          }
          params.delete('seats');
        }

        const search = params.toString();
        const newUrl =
          window.location.pathname + (search ? `?${search}` : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }

      if (!cancelled) {
        setUser(session);
        setPendingReservedSeats(reservedSeats);
        setReady(true);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Manual login — kept as a fallback for guests without an invitation link.
  // Invitation-based flow normally bypasses this; the form just submits.
  const login = useCallback(
    ({ name, email }) => {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanName = String(name || '').trim();

      if (!cleanName) {
        throw new Error('Please share your name so we can find your invitation.');
      }
      if (cleanEmail && !isValidEmail(cleanEmail)) {
        throw new Error('That email looks a bit off — please double-check it.');
      }

      const existing = cleanEmail ? findUser(cleanEmail) : null;
      const profile = upsertUser({
        name: cleanName,
        email: cleanEmail,
        reservedSeats: pendingReservedSeats ?? existing?.reservedSeats ?? 1,
        createdAt: existing?.createdAt || new Date().toISOString()
      });

      saveSession(profile);
      setUser(profile);
      setPendingReservedSeats(null);
      return profile;
    },
    [pendingReservedSeats]
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, logout, pendingReservedSeats }),
    [user, ready, login, logout, pendingReservedSeats]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
