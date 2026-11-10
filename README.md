# Know Your Worth

A Vite + React daily knowledge market game connected to Supabase. The project is deployed with GitHub Pages through the included GitHub Actions workflow.

## Included in this update

- Supabase email/password registration and login
- Europe/Zagreb daily challenge selection, with next-open-day fallback
- 100 FM portfolio allocation and server-side locking
- Server-started questions and server-validated answers / Worth Point rewards
- Live community market demand and category indices
- Daily, weekly, monthly and yearly category investment totals
- Local-only market surge simulator
- Prediction allowance and prediction placement
- Worth Points wallet and reward shop purchase flow
- Daily and period leaderboards

## Configure the live GitHub Pages site

The `SETUP REQUIRED` page means the production build did not receive its Supabase environment variables. Add them as GitHub Actions repository secrets:

1. Open `https://github.com/boohby/Know-Your-Worth`.
2. Choose **Settings → Secrets and variables → Actions**.
3. Click **New repository secret**.
4. Add `VITE_SUPABASE_URL` with this value:
   `https://iplpwpmwmgrpftwyfpgz.supabase.co`
5. Add `VITE_SUPABASE_PUBLISHABLE_KEY` with the Supabase **publishable** key for this project.
6. Never use a `service_role` key or a secret key in the website.
7. Open **Actions**, select **Deploy Know Your Worth**, and choose **Run workflow** (or push a commit to `main`). Wait for both Build and Deploy to finish successfully.
8. Open `https://boohby.github.io/Know-Your-Worth/` and hard-refresh with Ctrl+F5.

The workflow already reads those two GitHub secrets during the Vite build. Do not create a `.env` file in GitHub and do not commit credentials.

## Supabase Auth URLs

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://boohby.github.io`
- Add redirect URL: `https://boohby.github.io/Know-Your-Worth/`
- For local development also add `http://localhost:5173/`

Use only the project's publishable key in the frontend.

## Run locally

Install Node.js 20 or newer, extract this ZIP, open a terminal in the extracted folder, and run:

```bash
npm install
```

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://iplpwpmwmgrpftwyfpgz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Then run:

```bash
npm run dev
```

Open the localhost URL printed by Vite.

## Notes

- The GitHub Pages base path is `/Know-Your-Worth/` in `vite.config.js`.
- The app reads question prompt/options only. Correct answers are returned by the database RPC, not exposed in frontend queries.
- Market surge sliders are a local demonstration and never write real market values.
- Market open/close enforcement and scoring must remain server-side in Supabase.
- Run the production build and complete an authenticated end-to-end test before inviting players.
