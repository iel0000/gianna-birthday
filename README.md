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
VITE_HOST_EMAIL=
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

### EmailJS template settings (Settings tab, not Content)

The HTML body is only the email *content*. EmailJS needs the recipient/subject configured separately under each template's **Settings** tab. Set them exactly like this:

**Guest confirmation template:**

| Field | Value |
|---|---|
| To Email | `{{to_email}}` |
| To Name | `{{to_name}}` |
| Reply To | your own email |
| Subject | `Your seat in the fairy ring is saved 🧚‍♀️ — Avery's 1st Birthday & Christening` |
| From Name | `Avery's Fairy Court` |

**Host notification template:**

| Field | Value |
|---|---|
| To Email | `{{to_email}}` |
| To Name | `{{to_name}}` |
| Reply To | `{{guest_email}}` *(so hitting Reply emails the guest directly)* |
| Subject | `✨ New RSVP — {{guest_name}} ({{seats}} seats, {{attending_raw}})` |
| From Name | `Avery's RSVP Inbox` |

### Troubleshooting

**Orange banner: *"Email confirmations are not configured yet"*** — none of the EmailJS env vars are reaching the build.
- Locally: ensure `.env.local` exists in the project root and you've **restarted** `npm run dev` after editing it (Vite bakes env vars at startup).
- Deployed: the GitHub Actions workflow needs to re-run after secrets are added. Trigger it via *Actions → Deploy to GitHub Pages → Run workflow*.

**"recipients address is empty" (HTTP 422)** — the EmailJS template's **To Email** field is blank. Open both templates → Settings tab → set To Email = `{{to_email}}`. The HTML body alone isn't enough; EmailJS needs the destination configured too.

**"recipients address is corrupted" (HTTP 422)** — the address contains stray characters (whitespace, newlines, quotes). Most often a GitHub secret pasted with a trailing newline. The app already trims and scrubs the value, but double-check `VITE_HOST_EMAIL` doesn't have invisible characters in *Settings → Secrets and variables → Actions* (delete and re-create the secret if unsure).

**"The Public Key is invalid" (HTTP 400)** — re-copy from EmailJS *Account → General* and update the `VITE_EMAILJS_PUBLIC_KEY` secret.

**"API calls are disabled for non-browser applications" (HTTP 403)** — in EmailJS *Account → Security*, allow-list your deployed domain (or set to `*` while testing).

**Send succeeds but no email arrives** — check **EmailJS → Email Services** for the green "Connected" badge. If you connected Gmail/Outlook via OAuth, the connection occasionally lapses and needs to be re-authorised.

**Need to see the raw error?** Open the deployed site, submit an RSVP, then in browser devtools → Console look for `[RSVP email] send failed` — the EmailJS status code and message print right after.

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

## Deploy to GitHub Pages

This repo is wired for GitHub Pages via GitHub Actions. The build runs on every push to `main` and publishes the `dist/` output to Pages.

### One-time setup

1. **Create a repository on GitHub** (e.g. `giannas-birthday`) and push this folder as the repo root:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-user>/<your-repo>.git
   git push -u origin main
   ```
2. **Enable GitHub Pages**: in the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. **(Optional) Add EmailJS secrets**: in **Settings → Secrets and variables → Actions**, add:
   - `VITE_EMAILJS_SERVICE_ID`
   - `VITE_EMAILJS_GUEST_TEMPLATE_ID`
   - `VITE_EMAILJS_HOST_TEMPLATE_ID`
   - `VITE_EMAILJS_PUBLIC_KEY`
   - `VITE_HOST_EMAIL`

   Without these, the site still works (RSVPs save locally) but no email fires.

That's it. Push to `main` and the [Deploy to GitHub Pages](.github/workflows/deploy.yml) workflow takes care of the rest. The published URL appears in the workflow run summary and at **Settings → Pages**.

### What the workflow does

- Installs deps with `npm ci`.
- Reads the Pages-assigned base path (e.g. `/your-repo`) and passes it to Vite as `VITE_BASE_PATH` so all asset URLs resolve correctly.
- Sets `VITE_SITE_URL` to the live origin + base path so the "View or update your RSVP" link in confirmation emails points at the deployed site.
- Builds, copies `index.html` to `404.html` (so direct hits on any path still load the SPA), and uploads `dist/` as the Pages artifact.
- The `deploy` job publishes the artifact and prints the live URL.

### Custom domain

Add a `CNAME` file in `public/` containing your domain (e.g. `giannas-birthday.com`). Set the DNS records per [GitHub's docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), then in **Settings → Pages**, enter the custom domain. The workflow will detect the empty base path and asset URLs adjust automatically.
