// EmailJS configuration.
//
// 1. Sign up at https://www.emailjs.com (free tier supports ~200 sends/month).
// 2. Add an Email Service (Gmail/Outlook/etc.) and copy the Service ID.
// 3. Create TWO templates by pasting the HTML from email-templates/:
//      - guest-confirmation.html  -> Template ID for `guestTemplateId`
//      - host-notification.html   -> Template ID for `hostTemplateId`
// 4. Copy your Public Key from Account > General.
// 5. Fill in the values below (or set them via Vite env vars VITE_EMAILJS_*).
//
// Until these are filled in, the RSVP will still save locally and the UI will
// tell you that emails are not configured.

export const emailConfig = {
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID || '',
  guestTemplateId: import.meta.env.VITE_EMAILJS_GUEST_TEMPLATE_ID || '',
  hostTemplateId: import.meta.env.VITE_EMAILJS_HOST_TEMPLATE_ID || '',
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '',
  hostEmail: import.meta.env.VITE_HOST_EMAIL || 'ariel.magsino@hivve.tech',
  hostName: 'Ariel Magsino'
};

export const isEmailConfigured = () =>
  Boolean(
    emailConfig.serviceId &&
      emailConfig.guestTemplateId &&
      emailConfig.hostTemplateId &&
      emailConfig.publicKey
  );
