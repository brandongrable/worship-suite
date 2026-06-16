# Deploy guide

How to get Vocal Booth and Charter onto Vercel, and how to ship the
Pipeline desktop app to a producer. Supabase stays where it is
(project `hnrjycpjcnlzqqunmdac`); only the two web apps deploy.

This file is a checklist, not a script. Most steps need decisions
from you (domain names, plan tier, etc.) so we don't automate them.

---

## Vocal Booth + Charter on Vercel

Each app is a separate Vercel project pointing at this monorepo.
`apps/<app>/vercel.json` ships with the right build / install
commands; you just point Vercel at the right Root Directory.

### One-time setup per app

1. **Create the project**
   - https://vercel.com/new → Import this Git repo
   - Project Name: `worship-vocal-booth` (or whatever)
   - Framework Preset: **Other** (the bundled `vercel.json` handles it)
   - **Root Directory**: `apps/vocal-booth` (or `apps/charter`)
   - Leave Build/Install/Output commands blank — `vercel.json` wins.

2. **Environment variables** (Project → Settings → Environment Variables)

   Both apps need the same two browser-exposed Supabase keys:

   | Variable                  | Where to find it                                                |
   |---------------------------|------------------------------------------------------------------|
   | `VITE_SUPABASE_URL`       | Supabase → Project Settings → API → Project URL                 |
   | `VITE_SUPABASE_ANON_KEY`  | Supabase → Project Settings → API → `anon` `public` key         |

   **Do not** put `SUPABASE_SERVICE_ROLE_KEY` in a Vercel env var —
   it bypasses RLS and would be exposed to anyone hitting the site.
   That key only ever lives in Pipeline's local `.env.local`.

   Apply to: **Production**, **Preview**, **Development** (all three).

3. **Domain**
   - Vercel assigns `worship-vocal-booth.vercel.app` by default.
   - Custom domain: Project → Domains → add. Update DNS at your registrar.

4. **Supabase Auth redirect URLs**

   Magic-link sign-in posts back to `window.location.origin`. Add the
   production + preview URLs to the allow-list:

   - https://supabase.com/dashboard/project/hnrjycpjcnlzqqunmdac/auth/url-configuration
   - Add each app's production URL (e.g. `https://worship-vocal-booth.vercel.app`)
   - Add the preview wildcard if you want preview deployments to work:
     `https://worship-vocal-booth-*.vercel.app`
   - Custom domains: add those too.

   Without this, magic links from preview / production builds will
   land on `localhost:5173` (the configured site URL) or fail
   silently, and users will think auth is broken.

5. **First deploy** — push to `main`. Vercel auto-deploys. Watch
   the build log; it runs `pnpm install` + `pnpm --filter @worship/<app>
   build` from the workspace root.

### Verifying

Open the production URL → sign in with magic link → magic link
arrives → clicking it lands you back on the production URL (not
`localhost`) → you're signed in.

If the magic-link redirect lands on `localhost` instead, the
Supabase "Site URL" is still set to the dev URL. Update it to the
production URL in the same Auth → URL Configuration page (the Site
URL is the default; "Additional Redirect URLs" is the allow-list).

---

## Pipeline (Tauri desktop app)

Pipeline isn't a web app — it's a Tauri 2 desktop binary that runs
on the producer's machine. Distribution options:

1. **Local build only** (current state). Producer clones the repo,
   runs `pnpm --filter @worship/pipeline tauri:dev`. Fine for one
   producer (you).

2. **Signed `.dmg` / `.app` for macOS** (when you want to give
   Pipeline to another producer):

   ```bash
   pnpm --filter @worship/pipeline tauri:build
   ```

   Output lands in `apps/pipeline/src-tauri/target/release/bundle/dmg/`.
   For distribution outside your machine, the `.dmg` needs to be:

   - Signed with an Apple Developer ID (so Gatekeeper doesn't block it)
   - Notarized via `xcrun notarytool`

   Tauri's signing guide: https://tauri.app/v1/guides/distribution/sign-macos

   The recipient also needs `python3`, the `aligner` clone, and
   (for Phase 7) Demucs + WhisperX:

   ```bash
   pip install demucs whisperx
   ```

3. **Auto-update** (future) — Tauri supports auto-update via signed
   release manifests. Not wired today; revisit when there are
   multiple producers.

---

## Auth redirect URL — the one easy thing to miss

Mentioned above but worth a second mention: **the Supabase Site URL
controls where magic links redirect by default**. If you deploy
production and forget to update it, sign-in will silently route
your users to localhost.

- https://supabase.com/dashboard/project/hnrjycpjcnlzqqunmdac/auth/url-configuration
- Site URL: your production Vocal Booth (or Charter) URL
- Additional Redirect URLs: every URL you want auth to land on
  (production + previews + custom domains for both apps)

---

## CI deploys

GitHub Actions already runs build + test on every push (see
`.github/workflows/`). Vercel triggers a deploy on every push to
`main` (production) and every PR (preview). No additional CI
config needed.

If you want to add deploy gating (e.g. "preview only after CI
passes"), the Vercel project setting for that is
**Settings → Git → Ignore Build Step** — set it to:

```bash
git diff --quiet HEAD^ HEAD -- apps/<app> packages/
```

(Skips the deploy if neither the app nor any shared package
changed in the latest commit.)

---

## Pre-launch checklist

When you're ready to share with humans:

- [ ] Both Vercel projects deployed to production
- [ ] Both env vars set in Vercel (Production scope)
- [ ] Supabase Site URL updated to production Vocal Booth
- [ ] Supabase Additional Redirect URLs include both production URLs
- [ ] Test sign-in end-to-end from production (not localhost)
- [ ] Test stem upload + mixer playback in production
- [ ] Test setlist creation + drag-reorder
- [ ] Test sharing with a second account (verify the unviewed badge)
- [ ] Tauri Pipeline `.dmg` built + notarized (if shipping to other
      producers)
- [ ] Supabase backups / point-in-time-recovery enabled (Project
      Settings → Database → Backups) — currently on the free tier so
      this matters
