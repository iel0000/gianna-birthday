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

export const getUsers = () => read(USERS_KEY, []);
export const getRsvps = () => read(RSVPS_KEY, {});
export const getSession = () => read(SESSION_KEY, null);

export const saveSession = (user) => write(SESSION_KEY, user);
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

export const upsertUser = (user) => {
  const users = getUsers();
  const existing = users.find((u) => u.email.toLowerCase() === user.email.toLowerCase());
  if (existing) {
    Object.assign(existing, user);
  } else {
    users.push(user);
  }
  write(USERS_KEY, users);
  return user;
};

export const findUser = (email) => {
  return getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
};

export const saveRsvp = (email, rsvp) => {
  const rsvps = getRsvps();
  rsvps[email.toLowerCase()] = {
    ...rsvp,
    submittedAt: new Date().toISOString()
  };
  write(RSVPS_KEY, rsvps);
  return rsvps[email.toLowerCase()];
};

export const getRsvpFor = (email) => {
  if (!email) return null;
  return getRsvps()[email.toLowerCase()] || null;
};
