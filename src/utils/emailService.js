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
  const attendingLabel = rsvp.attending
    ? 'Yes — joining the celebration'
    : 'Sadly cannot attend';

  // Strict scrub: only allow chars valid in an email + clip at first whitespace
  // so a stray "\n" pasted into the host secret can't poison the address.
  const scrubEmail = (raw) =>
    String(raw || '')
      .trim()
      .split(/\s/)[0]
      .replace(/[^A-Za-z0-9@._+\-]/g, '');

  const guestEmail = scrubEmail(user.email);
  const hostEmail = scrubEmail(emailConfig.hostEmail);

  if (!hostEmail) {
    return { sent: false, reason: `Missing host recipient (host=empty)` };
  }

  // Site origin for the deep-link back into the invitation. Prefer the
  // invitation guid (the new primary URL) if we have one; otherwise fall
  // back to the legacy ?rsvp=email path so older invites still work.
  const siteOrigin =
    import.meta.env.VITE_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const rsvpLink = user.invitation?.guid
    ? `${siteOrigin}/?invite=${user.invitation.guid}`
    : guestEmail
      ? `${siteOrigin}/?rsvp=${encodeURIComponent(guestEmail)}#rsvp`
      : siteOrigin;

  const isGodparent =
    !!rsvp.isGodparent || !!user.invitation?.is_godparent;

  // Friendly summaries so the templates can stay simple — EmailJS doesn't
  // do conditionals, so any "show/hide" lives in the variable value.
  const kidsSummary = rsvp.attending && rsvp.bringingKids && rsvp.kidsCount > 0
    ? `Yes — ${rsvp.kidsCount} ${rsvp.kidsCount === 1 ? 'little one' : 'little ones'}`
    : 'No';

  const godparentNote = isGodparent
    ? '✨ Officially welcomed as one of Avery\'s godparents — thank you for saying yes.'
    : '';

  const godparentLabel = isGodparent ? 'Yes — godparent invitation' : 'No';

  const sharedParams = {
    guest_name: user.invitation?.name || user.name,
    guest_email: guestEmail || '—',
    attending: attendingLabel,
    attending_raw: rsvp.attending ? 'yes' : 'no',
    seats: rsvp.seats,
    bringing_kids: rsvp.bringingKids ? 'Yes' : 'No',
    kids_count: rsvp.kidsCount || 0,
    kids_summary: kidsSummary,
    is_godparent: isGodparent ? 'yes' : 'no',
    godparent_label: godparentLabel,
    godparent_note: godparentNote,
    message: rsvp.message || '—',
    submitted_at: submittedAt,
    celebrant_name: 'Gianna Avery Magsino',
    event_title: '1st Birthday & Christening',
    rsvp_link: rsvpLink
  };

  const tasks = [];

  // Guest confirmation only fires if the guest provided an email.
  if (guestEmail) {
    const guestParams = {
      ...sharedParams,
      to_name: sharedParams.guest_name,
      to_email: guestEmail
    };
    tasks.push(
      emailjs.send(emailConfig.serviceId, emailConfig.guestTemplateId, guestParams)
    );
  }

  // Host notification always fires.
  const hostParams = {
    ...sharedParams,
    to_name: emailConfig.hostName,
    to_email: hostEmail
  };
  tasks.push(
    emailjs.send(emailConfig.serviceId, emailConfig.hostTemplateId, hostParams)
  );

  try {
    await Promise.all(tasks);
    return { sent: true, sentToGuest: !!guestEmail };
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
