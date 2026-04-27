import emailjs from '@emailjs/browser';
import { emailConfig, isEmailConfigured } from './emailConfig.js';

let initialized = false;
const ensureInit = () => {
  if (!initialized && emailConfig.publicKey) {
    emailjs.init({ publicKey: emailConfig.publicKey });
    initialized = true;
  }
};

const formatDate = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

export async function sendRsvpEmails({ user, rsvp }) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: 'Email service is not configured yet. Check src/utils/emailConfig.js.' };
  }

  ensureInit();

  const submittedAt = formatDate(rsvp.submittedAt);
  const attendingLabel = rsvp.attending ? 'Yes — joining the celebration' : 'Sadly cannot attend';

  // Strict scrub: only allow chars valid in an email + clip at first whitespace
  // so a stray "\n" pasted into the host secret can't poison the address.
  const scrubEmail = (raw) =>
    String(raw || '')
      .trim()
      .split(/\s/)[0]
      .replace(/[^A-Za-z0-9@._+\-]/g, '');

  const guestEmail = scrubEmail(user.email);
  const hostEmail = scrubEmail(emailConfig.hostEmail);

  if (!guestEmail || !hostEmail) {
    return {
      sent: false,
      reason: `Missing recipient (guest=${guestEmail || 'empty'}, host=${hostEmail || 'empty'})`
    };
  }

  const siteOrigin =
    import.meta.env.VITE_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const rsvpLink = `${siteOrigin}/?rsvp=${encodeURIComponent(user.email)}#rsvp`;

  const sharedParams = {
    guest_name: user.name,
    guest_email: user.email,
    attending: attendingLabel,
    attending_raw: rsvp.attending ? 'yes' : 'no',
    seats: rsvp.seats,
    message: rsvp.message || '—',
    submitted_at: submittedAt,
    celebrant_name: 'Gianna Avery Magsino',
    event_title: '1st Birthday & Christening',
    rsvp_link: rsvpLink
  };

  const guestParams = {
    ...sharedParams,
    to_name: user.name,
    to_email: guestEmail
  };

  const hostParams = {
    ...sharedParams,
    to_name: emailConfig.hostName,
    to_email: hostEmail
  };

  try {
    await Promise.all([
      emailjs.send(emailConfig.serviceId, emailConfig.guestTemplateId, guestParams),
      emailjs.send(emailConfig.serviceId, emailConfig.hostTemplateId, hostParams)
    ]);
    return { sent: true };
  } catch (err) {
    // Surface the full EmailJS error in devtools so it's diagnosable.
    // Common shapes: { status: 400, text: 'The Public Key is invalid' }
    //                { status: 422, text: 'recipients address is empty' }
    console.error('[RSVP email] send failed', err);
    const detail =
      (err?.status ? `${err.status}: ` : '') +
      (err?.text || err?.message || 'unknown error');
    return {
      sent: false,
      reason: detail
    };
  }
}
