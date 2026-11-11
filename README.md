# Know Your Worth

A Vite + React daily knowledge market game connected to Supabase. The project is deployed with GitHub Pages through the included GitHub Actions workflow.

## Included in this update

- Supabase email/password registration and login
- Europe/Zagreb daily challenge selection, with next-open-day fallback
- 100 FM portfolio allocation and server-side locking
- Five-stage category challenges: multiple choice, open answer, ranking, true/false and estimation
- Sequential server-enforced progression; a wrong answer ends that category run
- Three player-selected categories per day, with a rolling three-market-session category rotation
- Server-side answer validation, escalating WP rewards and estimate-accuracy scoring
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

## Progressive question system

Each selected category has five stages in this order: multiple choice (100 WP), open answer (150 WP), ranking (200 WP), true/false (250 WP), and estimation (up to 300 WP). A player must answer each non-estimation stage correctly to unlock the next. Failed category runs cannot be restarted that day; WP already earned is retained.

Players select exactly three of the five categories each day. The database enforces category coverage over the previous two open market sessions plus the current one, where possible. Ranking options are shuffled per player. Open answers are normalized for case and whitespace. Estimation rewards use percentage error bands: 0–1% = 300 WP, >1–3% = 275, >3–5% = 250, >5–10% = 200, >10–20% = 150, >20–35% = 75, and >35% = 0.

The 14-day bank (11–24 November 2026) has been imported into the connected Supabase project: 350 stages total, 70 of each question type. The answer-bearing seed file is kept out of the frontend bundle and should not be committed to a public repository. The safe schema/RPC reference is `supabase/progressive_question_system.sql`.

## Notes

- The GitHub Pages base path is `/Know-Your-Worth/` in `vite.config.js`.
- The app retrieves only safe player-facing stage data through `fm_get_category_stages`. Correct options, accepted answers, ranking order, true/false keys and estimation targets stay private in `fm_question_stages` and are checked only by `fm_submit_question_stage`. Direct table access is revoked.
- Market surge sliders are a local demonstration and never write real market values.
- Market open/close enforcement and scoring must remain server-side in Supabase.
- Run the production build and complete an authenticated end-to-end test before inviting players.

## Black Swan Events, Market Predictions and Market Pulse

- A catalog of 10 rotating Black Swan events is stored in `fm_black_swan_catalog`.
- Daily challenges receive a deterministic event assignment, including its briefing, impacted category, severity, volatility and category bonus.
- At market close, the event bonus affects the category index; the volatility multiplier applies to the event's primary category only. Index movement remains capped at +/-5% per session.
- Market predictions use the existing `fm_prediction_bets` workflow and settle after the daily market close.
- `fm_prediction_pulse` exposes aggregate prediction counts and stakes without displaying player identities.
- The Market tab now includes Market Pulse: daily investment totals, trader count, strongest/weakest index moves, largest investment flow, community prediction count and recent closing moves.
- Market totals refresh through the existing Supabase Realtime subscription. The surge simulator remains local-only and does not affect actual balances.

The Supabase schema changes are applied to the connected project. The updated frontend source is in `src/App.jsx` and `src/styles.css`.


## Category share economy

- Spendable WP remains a stable wallet balance for the rewards shop.
- Correct-answer WP rewards and winning prediction payouts generate an additional category-share award worth 10% of the WP reward; the player's WP is not deducted.
- Each category share is priced at its live category index divided by 1,000. The category index changes at market close based on relative community investment demand, community quiz accuracy, and Black Swan event modifiers, with a daily movement limit.
- The Portfolio tab shows share units, current value, cost basis, and unrealized profit/loss. Players can sell all shares in a category back into spendable WP at the current index price.
- The database migration for this feature has been applied to the linked Supabase project. The tables are protected by row-level security; share redemption is handled by an authenticated RPC.


## Super Admin account

The production Supabase project grants the `super_admin` role to the existing Boohby account only. Authorization is bound to that account's immutable Supabase Auth user ID, not to a client-editable display name. The database helper `public.fm_is_super_admin()` checks `auth.users.raw_app_meta_data`; never grant this role from browser code or `raw_user_meta_data`.

Super Admin can lock a portfolio, start questions, submit answers, claim the daily prediction allowance, and place predictions outside regular market hours / on a closed challenge day. Regular accounts retain the original Zagreb market-hour and calendar checks. The frontend displays a Super Admin indicator but database functions enforce the actual permission.
