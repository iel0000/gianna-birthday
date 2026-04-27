import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearSession,
  findUser,
  getSession,
  saveSession,
  upsertUser
} from '../utils/storage.js';
import { isValidEmail } from '../utils/validators.js';

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

      // Reserved-seats invitation link: ?seats=N
      // For a fresh guest, the seat count is held until they enter name + email.
      // For an already-signed-in guest, override their reservedSeats immediately
      // so a new link from the host always wins.
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

    setUser(session);
    setPendingReservedSeats(reservedSeats);
    setReady(true);
  }, []);

  const login = useCallback(
    ({ name, email }) => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim();

      if (!cleanName || !cleanEmail) {
        throw new Error('Please share your name and email so we can find your invitation.');
      }
      if (!isValidEmail(cleanEmail)) {
        throw new Error('That email looks a bit off — please double-check it.');
      }

      const existing = findUser(cleanEmail);
      const profile = upsertUser({
        name: cleanName || existing?.name || cleanEmail,
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
