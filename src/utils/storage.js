const USERS_KEY = 'gianna.users';
const RSVPS_KEY = 'gianna.rsvps';
const SESSION_KEY = 'gianna.session';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

// Pick a stable identity for a user — invitation guid first (always present
// for the new invitation flow), then email (legacy / manual). Empty string
// if neither, which falls back to "no key".
export const userKey = (user) => {
  if (!user) return '';
  return (user.invitation?.guid || user.email || '').toLowerCase();
};

export const getUsers = () => read(USERS_KEY, []);
export const getRsvps = () => read(RSVPS_KEY, {});
export const getSession = () => read(SESSION_KEY, null);

export const saveSession = (user) => write(SESSION_KEY, user);
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

export const upsertUser = (user) => {
  const key = userKey(user);
  if (!key) return user;
  const users = getUsers();
  const existing = users.find((u) => userKey(u) === key);
  if (existing) {
    Object.assign(existing, user);
  } else {
    users.push(user);
  }
  write(USERS_KEY, users);
  return user;
};

export const findUser = (emailOrGuid) => {
  const k = String(emailOrGuid || '').toLowerCase();
  if (!k) return null;
  return (
    getUsers().find(
      (u) =>
        (u.email || '').toLowerCase() === k ||
        (u.invitation?.guid || '').toLowerCase() === k
    ) || null
  );
};

// Accepts either a full user object or just a string key (guid or email).
// Storing under a single key (guid or email) keeps backwards compat with
// rows written before the invitation flow existed.
export const saveRsvp = (keyOrUser, rsvp) => {
  const key =
    typeof keyOrUser === 'string'
      ? keyOrUser.toLowerCase()
      : userKey(keyOrUser);
  if (!key) return null;
  const rsvps = getRsvps();
  rsvps[key] = {
    ...rsvp,
    submittedAt: new Date().toISOString()
  };
  write(RSVPS_KEY, rsvps);
  return rsvps[key];
};

export const getRsvpFor = (keyOrUser) => {
  const key =
    typeof keyOrUser === 'string'
      ? keyOrUser.toLowerCase()
      : userKey(keyOrUser);
  if (!key) return null;
  return getRsvps()[key] || null;
};
