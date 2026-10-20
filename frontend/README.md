# Website frontend

React, TypeScript, Vite, Tailwind CSS, and Supabase Auth/Postgres.

## Local development (PowerShell)

From this directory:

```powershell
# Only if .env.local does not already exist:
Copy-Item .env.example .env.local
# Set the project URL and publishable/anon key privately in .env.local.
npm run dev
```

Install dependencies with `npm ci` if they are not installed. Restart Vite after
changing environment values. Never use Supabase secret/service-role keys or
database passwords in `VITE_` variables.

## Current routes

- `/`: public house landing page.
- `/connexion`: email/password login for accounts provided by the owner.
- `/reservation`: requires a session; guests request the whole house with dates,
  first and last name, guest count, full-hour arrival/departure times, and an
  optional note. A monthly color-coded calendar shows past and free dates,
  occupied dates with confirmed guests' names, and lets guests select an
  arrival and departure without crossing an occupied stay.
- `/gestion`: requires a session; the first Auth user can activate owner access,
  configure guest capacity, review requests, confirm/reject stays, and block dates.

Sessions survive reloads. Logout signs out this browser only. Authentication
errors are displayed without exposing credentials. Pending requests do not
reserve dates. Confirmations and owner blocks reserve checkout-exclusive ranges;
PostgreSQL prevents overlaps. Guest requests and private guest data are protected
by RLS; the authenticated calendar reveals only confirmed guests' names and
occupied dates.

Configure the Auth provider and create the initial account as described in
[the backend guide](../supabase/README.md). Public signup must be disabled in
Supabase itself. Execute the migration and activate the sole owner account as
described in [the booking setup guide](../docs/reservation.md). Set the home's
maximum guest capacity in `/gestion`; requests remain disabled until configured.

## Validation

```powershell
npm run build
npm run lint
```

Use a development Supabase project to verify successful login, reload, logout,
private request visibility, owner-only controls, capacity checks, checkout-
exclusive ranges, overlapping confirmation rejection, and owner-block conflicts.
Mocked browser checks alone do not replace applying the migration and verifying
the workflow against the project.

## Cloudflare Pages deployment

Store the source in a private GitHub repository and connect it to a Cloudflare
Pages project using **Import an existing Git repository**. Authorize access only
to the intended repository. Use the branch containing the validated version as
the production branch.

First validate locally from this directory:

```powershell
npm run build
npm run lint
```

Configure Pages as follows:

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable `NODE_VERSION` | `24` |
| Environment variable `VITE_SUPABASE_URL` | Your Supabase project HTTPS URL |
| Environment variable `VITE_SUPABASE_ANON_KEY` | Your publishable or legacy anon key |

Configure the variables for production before the first build. Configure preview
variables separately if preview deployments are needed. Vite embeds `VITE_`
values in the public bundle at build time; changes require a new deployment.
Never use secret/service-role keys. A local `.env.local` is not uploaded to
GitHub and does not configure Cloudflare.

Cloudflare builds and deploys after each push; do not commit or manually upload
`dist` for this workflow. The free `https://PROJECT.pages.dev` address is sufficient.
No custom domain, running Node.js server, or Directus deployment is required for
the current login flow.

Keep Cloudflare's default SPA fallback (no top-level `404.html`). Verify that
opening and refreshing `/connexion` and `/reservation` directly does not return
an HTTP 404.

In Supabase Authentication, set **Site URL** to the deployed HTTPS origin and keep
public signup disabled. Email/password sign-in does not require a redirect URL;
configure allowed redirect URLs explicitly before adding invitation, recovery,
or OAuth flows. Create a confirmed initial Auth user privately if none exists.
Keep only that first user until owner activation has been completed; do not add
guest accounts yet.

Verify actual sign-in, session persistence after refreshing, logout, and the
redirect to login when accessing protected routes without a session. If booking
tables have not been installed, `/reservation` may show a database error after
successful sign-in: this is not an authentication failure. Setting up bookings
requires the separate backend procedure; do not blindly rerun an existing
migration.

No deployment has been performed yet.
