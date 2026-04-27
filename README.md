# Gianna Avery's 1st Birthday & Christening

A pink-and-purple fairy-themed React invitation site with login-gated RSVP and themed email confirmations.

- **Celebrant:** Gianna Avery Magsino
- **When:** Saturday, October 3, 2026 — 1:30 PM
- **Where:** RCK Private Resort and Event Center, Purok Uno Camachiles, Rivera Compound, Mabalacat City, Pampanga
- **Theme:** pink & purple fairy ✨🧚‍♀️

## Stack

- React 18 + Vite
- Plain CSS with custom properties (no UI library — keeps the bundle tiny)
- localStorage for guest sessions and RSVP records
- [EmailJS](https://www.emailjs.com) for sending confirmation emails directly from the browser

## Run locally

```bash
cd gianna-birthday
npm install
npm run dev
```

The dev server opens at <http://localhost:5173>. Use the magic word `fairy` on the login screen.

## Add Gianna's photos

Drop image files into [`public/photos/`](public/photos/) using the filenames listed in that folder's [`README`](public/photos/README.md). Until a file exists, the page shows a soft "Photo coming soon" placeholder.

## Wire up email confirmations

Two themed emails fire on every RSVP:

1. **Guest confirmation** — to the guest who RSVP'd
2. **Host notification** — to you (`ariel.magsino@hivve.tech` by default), with name, attending status, and seat count

Setup steps:

1. Sign up at <https://www.emailjs.com> (free tier covers ~200 sends/month).
2. Add an Email Service (Gmail, Outlook, etc.) and copy its **Service ID**.
3. Create two templates by pasting the HTML from [`email-templates/guest-confirmation.html`](email-templates/guest-confirmation.html) and [`email-templates/host-notification.html`](email-templates/host-notification.html). Copy each template's **Template ID**.
4. Grab your **Public Key** from the EmailJS Account → General page.
5. Either edit [`src/utils/emailConfig.js`](src/utils/emailConfig.js) directly, or create a `.env.local` file in the project root:

```env
VITE_EMAILJS_SERVICE_ID=service_xxxxxxx
VITE_EMAILJS_GUEST_TEMPLATE_ID=template_xxxxxxx
VITE_EMAILJS_HOST_TEMPLATE_ID=template_xxxxxxx
VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxx
VITE_HOST_EMAIL=ariel.magsino@hivve.tech
# Optional — used to build the "View or update your RSVP" link in the guest email.
# Falls back to window.location.origin if unset (works fine for most setups).
VITE_SITE_URL=https://giannas-birthday.example.com
```

6. Restart `npm run dev`. Until configured, RSVPs still save locally and the form will tell you emails aren't wired yet.

### Template variable cheat-sheet

The app sends these variables to **both** templates:

| Variable | Example |
| --- | --- |
| `to_name` / `to_email` | recipient name & email |
| `guest_name` / `guest_email` | the RSVP submitter |
| `attending` / `attending_raw` | "Yes — joining the celebration" / "yes" or "no" |
| `seats` | number of seats (0 if not attending) |
| `message` | message for Avery or `—` |
| `submitted_at` | formatted timestamp |
| `celebrant_name` | "Gianna Avery Magsino" |
| `event_title` | "1st Birthday & Christening" |
| `rsvp_link` | `https://yoursite/?rsvp=email#rsvp` — guests click this to auto-sign back in and view or update their RSVP |

In the **host template settings**, set `Reply To` to `{{guest_email}}` so you can reply directly to guests.

## Project layout

```
gianna-birthday/
├── public/photos/              # drop celebrant photos here
├── email-templates/            # paste these into EmailJS
├── src/
│   ├── components/
│   │   ├── Hero.jsx
│   │   ├── EventDetails.jsx
│   │   ├── Gallery.jsx
│   │   ├── PhotoFrame.jsx
│   │   ├── Login.jsx
│   │   ├── RsvpForm.jsx
│   │   └── Sparkles.jsx
│   ├── context/AuthContext.jsx
│   ├── utils/
│   │   ├── emailConfig.js
│   │   ├── emailService.js
│   │   ├── storage.js
│   │   └── useReveal.js
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   └── main.jsx
└── index.html
```

## Reserved-seats invitation links

You can send each guest (or family) a link with a pre-allocated seat count. The guest still enters their name and email on the login screen — the URL only carries the seat count, never personal info:

```
https://giannas-birthday.example.com/?seats=4
```

When the guest opens the link:
1. The login screen shows a banner: *"4 seats reserved for you — enter your name and email below."*
2. They sign in with name + email.
3. The RSVP form shows the locked seat count as a decorative, non-editable field. They only confirm attending/not and leave an optional message.

The `seats` param is stripped from the URL after the first visit. The seat count persists in their browser session, so they can return later via the plain site URL or the `?rsvp=email` link in their confirmation email.

For returning visitors who've already RSVP'd, the email confirmation includes a `?rsvp=email@example.com` link that restores their session and shows their existing details.

## Build for production

```bash
npm run build      # → dist/
npm run preview    # serves dist/ locally for a smoke test
```

The output in `dist/` is a static site — drop it on any static host (Netlify, Vercel, GitHub Pages, S3 + CloudFront, etc.).
