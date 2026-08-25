# Gianna Avery's 1st Birthday & Christening

A pink-and-purple fairy-themed invitation site. Every guest gets their own link — `?invite=<guid>` — that opens a personalised page with their name and reserved seats already filled in. The host runs a private guest list at `#guests` to create invitations, watch responses land, and check people in on the day.

**The celebration:** Saturday, October 3, 2026 · 1:30 PM · RCK Private Resort and Event Center, Mabalacat, Pampanga.

Built with React 18 + Vite, Supabase (Postgres + Auth), EmailJS, and deployed to GitHub Pages.

> Working on the code? [CLAUDE.md](CLAUDE.md) is the engineering companion to this file — architecture, conventions, and the lessons that cost real iteration time.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in the two Supabase values
npm run dev                    # http://localhost:5173
```

The site runs without any configuration, but nothing persists — you need Supabase for the guest list to work. Set that up next.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build → `dist/` (also copies `index.html` → `404.html` for SPA fallback) |
| `npm run preview` | Serve the production bundle locally to smoke-test it |

---

## Setting up Supabase

The database is a hosted Postgres project. The browser talks to it over the REST API — there's no connection string anywhere in the code, just two public env vars.

**1. Create the project** at [supabase.com](https://supabase.com), then go to **Settings → API** and copy the *Project URL* and the *anon public* key.

**2. Put them in `.env.local`:**

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

**3. Create the tables.** Open **SQL Editor → New query**, paste all of [supabase/schema.sql](supabase/schema.sql), and run it. The script is idempotent — re-running it on a populated database adds any missing columns and constraints without touching your data.

**4. Create the host login.** Go to **Authentication → Users → Add user** and set an email + password. That account is what unlocks the admin pages; the site exposes no signup path, only sign-in.

**5. Restart `npm run dev`.** Vite reads env only at startup.

### Is the anon key really safe to publish?

Yes — that's what it's for. It identifies the project, not a person, and it ships in every Supabase browser app. RLS is deliberately **disabled** on both tables (the reasoning is in a comment block in `schema.sql`); the admin pages are gated at the application layer by Supabase Auth. The threat model here is "a friend opens devtools", not a determined attacker, and everything in the database is an invitation the host is handing out anyway.

### The two tables

```
invitations                          rsvps
  guid   ← the URL token             invitation_id → invitations.id
  name                               attending, seats, kids_count
  seats  ← reserved for this party   is_godparent, message
  is_godparent                       checked_in, checked_in_at
```

`invitations` is the entry point: the guid *is* the guest's identity. One RSVP row per invitation, upserted on `invitation_id`, so a guest re-submitting updates in place.

---

## Setting up EmailJS (optional)

Skip this and everything still works — RSVPs save to Supabase, only the confirmation emails are silently skipped.

1. Sign up at [emailjs.com](https://www.emailjs.com) (the free tier covers ~200 sends/month).
2. Add an **Email Service** (Gmail, Outlook, …) → copy the Service ID.
3. Create **two templates** and paste in the HTML from [email-templates/](email-templates/):
   - `guest-confirmation.html` → `VITE_EMAILJS_GUEST_TEMPLATE_ID`
   - `host-notification.html` → `VITE_EMAILJS_HOST_TEMPLATE_ID`
4. Copy your **Public Key** from Account → General.
5. Fill the four `VITE_EMAILJS_*` values in `.env.local`.

**Two things that will bite you.** In each template, set the recipient on the **Settings** tab (`To Email = {{to_email}}`) — not in the HTML body, or EmailJS returns `422 recipients address is empty`. And EmailJS templates have no conditionals: `{{#if}}` does not exist, so anything conditional is baked into the *value* — `godparent_note` is an empty string for regular guests and a full sentence for godparents, dropped straight into a `<p>`.

---

## Environment variables

Every variable lives in [.env.example](.env.example). Only the first two are required.

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Settings → API |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Settings → API, "anon public" |
| `VITE_EMAILJS_SERVICE_ID` | — | Blank disables all email |
| `VITE_EMAILJS_GUEST_TEMPLATE_ID` | — | |
| `VITE_EMAILJS_HOST_TEMPLATE_ID` | — | |
| `VITE_EMAILJS_PUBLIC_KEY` | — | |
| `VITE_HOST_EMAIL` | — | Defaults to `ariel.magsino@hivve.tech` |
| `VITE_SITE_URL` | — | Email links; the deploy workflow sets it |
| `VITE_BASE_PATH` | — | Vite base, defaults to `./`; the deploy workflow sets it |

`.env.local` is gitignored. Paste carefully — a trailing newline in a key is what produces EmailJS's "recipients address is corrupted".

---

## Running the event

### Guest list — `/#guests`

Sign in with the Supabase Auth account you created. From here you can:

- **Add an invitation** — name, seat count, and whether they're being asked to be a godparent. Type the title straight into the name if you want one (“Ninong Rico Reyes”) — it travels with the name onto their card and emails.
- **Import a CSV** — columns `Name, Seats, Godparent`. See [samples/invitations-template.csv](samples/invitations-template.csv); the header matching is forgiving (`Guest Name`, `Seat Count`, `Is Godparent` all work) and Godparent accepts `Yes/True/Y/1/Ninong/Ninang`.
- **Share the link** — each row's ⋯ menu has **Copy URL** and **Invitation card**, which draws a themed PNG carrying the guest's name and their reserved seats. Pick one of three styles for that guest:
  - **Standard** — the message plus a QR with Avery's photo in the middle, and the link in plain text underneath.
  - **Step by step** — the same QR with numbered instructions above it (open your camera, point it at the square, tap the link), for someone who has a smartphone but has never scanned a code.
  - **No reply needed** — no QR, no link, nothing to tap. It says their seats are saved and to simply come. For guests who won't RSVP online at all; just mark them attending yourself from the RSVPs table.
- **Generic invitation card** — a button in the Invitations toolbar draws a "You are invited" card with no name and no seat count. One image for a group chat, a story, or a printed board at the door; nothing personal leaks when it gets forwarded. Anyone who needs to RSVP still needs their own link.
- **Godparent proposal** — a button in the Invitations toolbar opens the "Will you be my Ninong?" / "Will you be my Ninang?" cards. There's one card per role, each a static image you send to everyone you're asking that of — separate from each person's invitation link.
- **Export cards in bulk** — tick the checkboxes on the invitations table (or the header box to take everything currently shown), then **Export cards**. Pick one of the three styles and it downloads a single zip with one PNG per guest inside, each named after them.
- **Track what you've sent** — each invitations row has a **Mark sent** toggle. Tick it once you've actually handed over the link or card and it turns into **✓ Sent** (hover shows when). It's your own bookkeeping — nothing guest-facing reads it — and the ✉️ Sent / Not sent filter pills turn it into a to-do list of who still needs their invitation.
- **Filter either table** — search by name, filter by status (the invitations table adds **Pending**, i.e. who hasn't replied), and narrow to 💜 Godparents or Non-godparents. Filtering also drives the row count, the seat total, and the CSV export, so "Godparents → Export" gives you just those rows.
- **Watch responses** — stat tiles across the top, a filterable RSVP table, and CSV export of either table.
- **Edit an RSVP** on a guest's behalf. Invitations can only be edited while still pending — once someone has replied, their seat count is locked to what they confirmed.

### Attendance — `/#checkin`

The day-of view, same login. Search a name, tap to mark them arrived, and the arrival time is stamped on their RSVP. Filter by pending vs arrived to see who's still on the way.

### What a guest sees

They open their link and land on the page with their name already in it. If their invitation is flagged as a godparent, a heartfelt intro appears above the form. They pick attending or not, adjust how many little ones they're bringing, optionally leave a message and an email, and submit. After that the form is replaced by a locked summary card — plus, if they're coming, a downloadable invitation pass — and any further edits go through the host. Email is optional throughout; the invitation guid identifies them, so the summary follows them to a new device or a private tab.

---

## Deploying

Push to `main` and [the workflow](.github/workflows/deploy.yml) builds and publishes to GitHub Pages. One-time setup:

1. **Settings → Pages → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions** — add the same variable names you put in `.env.local`. `VITE_BASE_PATH` and `VITE_SITE_URL` are *not* secrets; the workflow derives them from the URL Pages assigns.

**Vite inlines `import.meta.env.*` at build time.** A new or corrected secret changes nothing until something rebuilds — after editing secrets, re-run the workflow.

---

## Troubleshooting

**"Could not load the guest list" / RSVPs don't save.** `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing or has whitespace in it. Locally: check `.env.local` and restart the dev server. In production: check the repo secrets, then re-run the workflow.

**Can't sign in to `#guests`.** The account has to exist in Supabase → Authentication → Users. There's no signup path in the app by design.

**Emails never arrive.** All four `VITE_EMAILJS_*` values must be set — `isEmailConfigured()` requires the whole set. If they are set and sends still fail, check the template's Settings tab has `To Email = {{to_email}}`. Guest emails only fire when the guest supplied an address; the host notification always fires.

**A guest's link shows a generic page.** The guid isn't in `invitations` — usually the row was deleted, or the URL got truncated in a messaging app. Copy it again from the row's ⋯ menu.

**Images 404 after deploying.** An asset path is missing its base. Every `public/` reference must be written as `` `${import.meta.env.BASE_URL}fairy1.png` `` — a leading-slash path breaks on a project Pages site served from `/<repo>/`.

---

Made with love for Avery. 🧚‍♀️💜
