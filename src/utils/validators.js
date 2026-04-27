// Single source of truth for input validation across the site.

// Permissive but strict-enough email regex:
//   • one or more characters that aren't whitespace or @
//   • an @
//   • a domain (no whitespace, no @)
//   • a dot
//   • a TLD (no whitespace, no @, no dot)
// Catches the common mistakes ("foo", "foo@", "foo@bar", "foo bar@x.com")
// without rejecting valid edge cases like plus-tags or international TLDs.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;

export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}
