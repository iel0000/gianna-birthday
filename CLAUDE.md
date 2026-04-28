# CLAUDE.md — Gianna Avery's 1st Birthday & Christening

Working notes for anyone (human or LLM) picking up this codebase. Captures the architecture in one page, the conventions to follow, and the lessons learned the hard way during the build.

## What this is

A pink-and-purple fairy-themed React invitation site for **Gianna Avery Magsino**'s 1st birthday and christening (Saturday, October 3, 2026, 1:30 PM, RCK Private Resort and Event Center, Mabalacat, Pampanga). Each guest gets a personalised `?invite=<guid>` URL. The host runs an admin guest list at `#guests` to create invitations, see responses, and edit RSVPs.

## Stack

- **React 18 + Vite** — single-page SPA, no router (hash routing for the admin)
- **Plain CSS with custom properties** — pink/purple tokens (`--pink-500`, `--purple-700`, etc.) live in `src/index.css`
- **Supabase** (Postgres + Auth) — primary data store and the admin login
- **EmailJS** — sends the guest confirmation + host notification emails directly from the browser
- **GitHub Pages + GitHub Actions** — static deploy from the `main` branch

## Project tree

```
gianna-birthday/
├── .github/workflows/
│   └── deploy.yml            # builds + deploys to GitHub Pages on push to main
├── email-templates/          # paste these into EmailJS template editor
│   ├── guest-confirmation.html
│   └── host-notification.html
├── public/
│   ├── fairy{1..4}.png       # cartoon fairies in the page background (alpha cleaned)
│   ├── photos/               # celebrant photo placeholders (gianna-hero.jpg, gianna-1..4.jpg)
│   └── .nojekyll             # tells GitHub Pages to skip Jekyll
├── qr-codes/                 # admin-side artefacts (seats-1.png … seats-5.png) for printed invites
├── samples/
│   └── invitations-template.csv
├── scripts/
│   ├── generate-qr-codes.py  # one-off Python: themed QR cards for printed invites
│   └── remove-bg.py          # one-off Python: strip white from a fairy JPG → transparent PNG
├── src/
│   ├── components/
│   │   ├── Hero.jsx          # celebrant name, date, portrait
│   │   ├── EventDetails.jsx  # christening / reception / what to bring + venue card
│   │   ├── Gallery.jsx       # 4-photo grid (uses /public/photos/*)
│   │   ├── BackgroundImages.jsx  # 5 cartoon fairies floating around the viewport
│   │   ├── PhotoFrame.jsx    # circle/rounded photo with auto-fallback placeholder
│   │   ├── Sparkles.jsx      # animated background sparkles
│   │   ├── Login.jsx         # "Open your invitation link" message (no manual login)
│   │   ├── RsvpForm.jsx      # the unified RSVP form (guest or godparent mode)
│   │   └── GuestList.jsx     # admin page (auth-gated) — invitations + RSVPs + CSV
│   ├── context/
│   │   └── AuthContext.jsx   # reads ?invite=<guid> on mount, seeds session from invitation
│   ├── utils/
│   │   ├── supabaseClient.js # single createClient() instance (anon key)
│   │   ├── adminAuth.js      # Supabase Auth wrapper for the host login
│   │   ├── rsvpDb.js         # ALL DB ops: invitations CRUD + rsvps upsert/lookup
│   │   ├── storage.js        # localStorage-backed user/rsvp state
│   │   ├── emailConfig.js    # EmailJS env-var-fed config
│   │   ├── emailService.js   # sendRsvpEmails — builds params, calls EmailJS twice
│   │   ├── validators.js     # isValidEmail (single regex)
│   │   ├── csv.js            # parser + buildHeaderIndex for the import flow
│   │   └── useReveal.js      # IntersectionObserver hook for scroll-in animations
│   ├── App.jsx               # composes the landing page + hash router (#guests → admin)
│   ├── App.css               # ALL component styles (no per-component CSS files)
│   ├── index.css             # CSS custom properties + base body styles
│   └── main.jsx              # ReactDOM.createRoot + AuthProvider
├── supabase/
│   └── schema.sql            # idempotent setup script — paste into Supabase SQL Editor
├── index.html
├── package.json
├── vite.config.js            # base: process.env.VITE_BASE_PATH || './'
├── README.md                 # user-facing setup guide
└── CLAUDE.md                 # this file
```

## Architecture in one diagram

```
                                 ┌──────────────────────┐
   Admin ──signs in──────────────▶ /#guests (GuestList) │
                                 │  • InvitationManager │
                                 │  • RSVPs table       │
                                 │  • CSV import/export │
                                 └─────────┬────────────┘
                                           │ Supabase Auth + REST
                                           ▼
   ┌─────────────────────────────────────────────────────┐
   │              Supabase                               │
   │   invitations  ──────  rsvps  (FK invitation_id)    │
   │     guid (UUID)        attending, seats, kids,      │
   │     name, seats        is_godparent, message, ...   │
   │     is_godparent                                    │
   └────────▲─────────────────────▲──────────────────────┘
            │ fetchInvitation     │ persistRsvpToSupabase
            │                     │
   Guest ──opens ?invite=<guid>──▶ Landing page (App.jsx)
                                  • Hero / Event Details / Gallery
                                  • RsvpForm (mode = invitation.is_godparent
                                              ? 'godparent' : 'guest')
                                  • Submit → Supabase + EmailJS
```

## How a guest journey works

1. Host creates an invitation through the admin (`#guests`). DB inserts a `invitations` row with `guid`, `name`, `seats`, `is_godparent`.
2. Host shares the URL (`/?invite=<guid>`) — copy-paste from the row's ⋯ menu, or download a QR PNG, or print one of the styled cards in `qr-codes/`.
3. Guest opens the URL. `AuthContext` reads `?invite=<guid>`, calls `fetchInvitation(guid)`, hydrates `user.invitation` and `user.reservedSeats`. The URL param is stripped from the address bar.
4. Landing page renders. If `user.invitation.is_godparent` is true, a heartfelt godparent intro card slots in above the form. The form's `mode` prop reflects the same flag.
5. Guest fills the form (optional email, attending toggle, locked seat count, optional kids switch + count, optional message) and submits.
6. `RsvpForm` writes:
   - `localStorage` (so the locked-after-submit summary persists)
   - Supabase `rsvps` (upsert keyed on `invitation_id`)
   - EmailJS (guest confirmation only fires if email is provided; host notification always fires)
7. Subsequent visits show the locked summary instead of the form. `RsvpForm` checks local cache first, then Supabase by email — so a guest who RSVPs on phone and opens the link on laptop sees their submission.

## Code standards

These have been earned, not imagined.

### React / JavaScript

- **No router** — hash route for `#guests` and `#admin` only. Everything else is the landing page.
- **Single CSS file** — `src/App.css` holds all component styles. Keep BEM-ish prefixes (`.guests__filters`, `.rsvp__locked-quote`).
- **CSS variables** for colours and shadows — defined in `src/index.css`. Don't hard-code `#d94994` again; use `var(--pink-700)`.
- **`import.meta.env.BASE_URL`** in front of every `public/` asset path. Never write `/fairy1.png` — write `${import.meta.env.BASE_URL}fairy1.png` so it works under both `./` and `/<repo>/` bases.
- **Inline styles for one-offs are fine.** Don't add a class for a single declaration that won't be reused.
- **Prefer composition over flags.** `RsvpForm` takes a `mode` prop; the godparent intro lives in `App.jsx`, not inside the form.
- **`fairy-` keyframe naming** for the brand animation set (`fairy-rise`, `fairy-fade`, `fairy-bob`, `fairy-float`).

### Database / Supabase

- **`invitations` is the entry point.** GUID = URL token = primary identity. Don't add another identifier.
- **Upsert on `invitation_id`** for new RSVPs; fall back to `email` only for legacy rows.
- **`is_godparent` lives on `rsvps`.** No separate godparents table — schema.sql actually drops it on every run for projects coming from the older two-table flow.
- **RLS is OFF.** Disabled deliberately after multiple policy mismatches. The admin page is gated at the application layer via Supabase Auth. If you ever re-enable RLS, the schema has the policy snippet ready in a comment block.
- **Triggers do the boring work** — `normalize_rsvp_email` lowercases on every write, `touch_updated_at` bumps the timestamp.
- **Always use `if not exists` / `do $$` guards** in `supabase/schema.sql` so re-running the script is safe on a populated database.

### Email (EmailJS)

- **Two templates: guest confirmation + host notification.** Both pasted by the host into EmailJS template editor.
- **EmailJS has no conditionals.** Any "show only when X" needs to be encoded in the variable value. Pattern: `godparent_note` is `''` for regular guests and a full sentence for godparents — drop directly into a `<p>`.
- **`{{to_email}}` and `{{to_name}}` go in the template's Settings tab,** not the HTML body. The body is the *content*; the destination is configured separately.
- **Email is optional.** Guest-side emails skip when no email is provided. Host email always fires.

### Forms

- **Single combined RSVP form.** No separate login step. Name comes from the invitation; email is optional.
- **Locked after submit.** Once a guest submits, the form is gone — they see a read-only summary. Edits go through the host (admin can edit RSVP via `#guests`).
- **Validation lives in `src/utils/validators.js`.** One regex (`isValidEmail`) — used by AuthContext, RsvpForm, and the godparent flow.

### Animations

- **Use `useReveal()` for scroll-in.** It wraps IntersectionObserver and toggles a `.is-visible` class.
- **Keep transitions modest** — 200-700ms, ease-out / cubic-bezier(0.2, 0.7, 0.2, 1).
- **Respect `prefers-reduced-motion`.** Already handled in App.css.

## Lessons learned (the hard ones)

These each cost real iteration time. Don't repeat them.

### Postgres / RLS

- **Unique INDEX vs unique CONSTRAINT.** `ON CONFLICT (email)` needs a CONSTRAINT, not just an index — even a unique index on `lower(email)` doesn't satisfy it. Use `alter table ... add constraint ... unique (email)`.
- **RLS sits on top of grants.** A perfect `with check (true)` policy fails if the role doesn't have INSERT on the table itself. Always `grant insert, update on public.X to anon, authenticated` before tuning policies.
- **`to anon` vs `to public`.** Some Supabase projects route browser-key requests through a role that doesn't match the literal `anon` policy. `to public` always matches.
- **When all else fails, disable RLS.** This is a small private invitation site, not a SaaS. The anon key is already public.
- **Whitespace in secrets.** GitHub secrets pasted with a trailing newline produce "recipients address is corrupted" from EmailJS. Always `.trim()` env values before use.
- **Defend against empty `error.message`.** Some Supabase / Postgres errors come through with a blank `message` field; build the user-facing reason from `error.message → details → hint → "Postgres <code>"` so a "Database note: undefined" doesn't end up in the UI.
- **Wrap upserts in try/catch.** Network failures throw rather than returning `{ error }` — without a catch they reach the React error boundary as an unhandled rejection. Always wrap and surface the captured error.

### EmailJS

- **No template conditionals.** `{{#if}}` doesn't exist. Bake conditionals into the variable values (`godparent_note` empty vs sentence).
- **Recipient field is in Settings, not Content.** Forgetting to set `To Email = {{to_email}}` produces `422 recipients address is empty`.
- **Public key is build-time.** `import.meta.env.VITE_*` is inlined by Vite; new GitHub secrets won't take effect until the workflow re-runs.

### Vite / GitHub Pages

- **Use `base: './'` for portability.** Works for any deployment path. Override via `VITE_BASE_PATH` if you need `/<repo>/`.
- **Asset paths must use `${import.meta.env.BASE_URL}`.** `<img src="/fairy1.png">` breaks on a project Pages site at `/repo-name/`.
- **`.nojekyll` in `public/`** to stop GitHub Pages from running Jekyll on the build output.
- **Spawned with `cmd` not bash on Windows.** Long lines using `cp` etc. work fine via Git Bash, but in a `package.json` script use a `node -e` one-liner so it runs cross-platform.

### Locked CSS quirks

- **`overflow-x: auto` implicitly clips overflow-y.** A dropdown menu inside a horizontally-scrollable table-wrapper gets clipped. Render via React Portal at `document.body` and position with `getBoundingClientRect`.
- **Cursive scripts need padding.** `Great Vibes` has tall ascenders/descenders. `line-height: 1` clips the G/g — needs `line-height: 1.15` plus a touch of vertical padding.
- **`mix-blend-mode: multiply` is a hack** to remove a white background. Real transparency (PNG alpha) is always cleaner. The Python script in `scripts/remove-bg.py` does the threshold/feather pass.

### React state management

- **Local cache + remote source of truth.** `RsvpForm` reads localStorage first (instant render) then Supabase (covers the cross-device case). The localStorage write happens before the Supabase write so the UI lock is always immediate.
- **Effects should be cancellable.** Every `useEffect` that fetches uses a `cancelled` flag on cleanup, so a second invitation arriving doesn't race the first.
- **AuthContext reads URL params on mount.** Strips them after consuming via `history.replaceState`. Don't leave `?invite=<guid>` in the URL — it'd persist in browser history.
- **Look up by the most universal key first.** `RsvpForm` checks `fetchRsvpByInvitation(invitation.id)` before falling back to `fetchRsvpFromSupabase(email)`. Email is optional now, so an email-only lookup leaves cross-browser / private-tab guests stuck on the empty form. The invitation guid in the URL is always present — let it drive the lookup.
- **Audit error fallbacks when removing a code path.** A "Database note: unknown error" lingered in the UI after the godparent-table mirror write was removed because the `godparentResult?.reason || 'unknown error'` fallback still fired with `godparentResult` undefined. When you delete a Promise.all branch, also delete every reference in the result handling — including the literal-string fallbacks.

### UI / UX

- **Replace `window.confirm` and `window.alert` with a themed dialog.** The native ones break the visual flow on a designed page. The site has a `ConfirmProvider` at the root and a `useConfirm()` hook that returns Promise-returning `confirm()` and `alert()`. Use `const ok = await confirm({ title, message, confirmLabel, danger });` instead. The component handles Enter/Escape/backdrop, focuses the primary button, and exposes a `danger` variant with a hot-pink confirm button.
- **Form errors belong inline near the field.** Setting validation errors on a global "note" state that only renders after submit means the user never sees the error (the form has been replaced by the locked summary by then). Bad pattern that hid email-validation errors for a while.
- **Diagnostic UI noise should retire after stabilization.** "Saved to the guest list ✓" / "A confirmation has fluttered into your inbox" / "Database note: …" were necessary during integration; once everything works, the locked summary card itself is the success signal. Keep the failure paths logging to `console.warn` — that's enough for the host to diagnose anything that goes wrong without cluttering the guest's view.

## Build & run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/  (also copies index.html → 404.html for SPA fallback)
npm run preview  # smoke-test the production bundle locally
```

Env vars (set in `.env.local` for dev, GitHub Actions secrets for prod):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_EMAILJS_SERVICE_ID=
VITE_EMAILJS_GUEST_TEMPLATE_ID=
VITE_EMAILJS_HOST_TEMPLATE_ID=
VITE_EMAILJS_PUBLIC_KEY=
VITE_HOST_EMAIL=
VITE_SITE_URL=               # optional — used in email rsvp_link
VITE_BASE_PATH=              # optional — Vite base, defaults to ./
```

## Adding a new admin column / RSVP field

This is the most common refactor — playbook:

1. Add the column in `supabase/schema.sql` with `add column if not exists`. Re-run the schema in Supabase SQL Editor.
2. Update `persistRsvpToSupabase` (write) and `fetchAllInvitationsWithStatus` + `fetchRsvpFromSupabase` (read) in `src/utils/rsvpDb.js`.
3. Add the field to `RsvpForm`'s `initialState` and form JSX.
4. Surface it in `GuestList.jsx`: stat tile (if it's a count), table column, RSVP_COLUMNS for CSV, and the `EditRsvpModal` if the host should be able to edit it.
5. Pass it to the email template via `emailService.js` — both as a raw value and as a friendly summary string (no template conditionals, remember).
6. Update the README's variable cheat-sheet.
7. Build (`npm run build`), commit, and re-run the GitHub Actions workflow so the new env-baked code reaches production.

## Philosophy

Small private events don't need enterprise-grade infrastructure. RLS, magic-link auth, and CSP headers were considered and traded away for simplicity. The threat model is "a friend opens devtools" — not a determined attacker. If you're tempted to add complexity, ask whether it actually protects anything that isn't already public via the anon key.
