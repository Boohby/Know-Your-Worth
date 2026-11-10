# Fact Market — deployable website starter

This is a Vite + React frontend wired to the existing Supabase project **Know Your Worth**.

## What is included

- Email/password sign-up and sign-in through Supabase Auth
- Daily challenge lookup
- Live community demand from `fm_market_demand`
- Realtime refresh when `fm_market_totals` changes
- 100 FM allocation UI with 5–40 FM per category
- Portfolio locking through `fm_lock_portfolio`
- Question submission through `fm_submit_answer`
- Daily leaderboard view
- Five independent market surge controls; these are browser-only simulations and never write to Supabase
- Responsive dark trading-terminal design

## Before you deploy

The Supabase database exists, but it currently has **no seeded questions**. The site will show a clear empty state until a daily challenge has 15 question rows (3 in each category). The backend and frontend are connected, but this is not yet a public-launch-ready game: review the security/performance checklist and complete end-to-end testing first.

The daily leaderboard only shows users once the backend's completion criteria are met. Ask for a production readiness pass before inviting the public.

## 1. Get your Supabase publishable key

1. Open https://supabase.com/dashboard/project/iplpwpmwmgrpftwyfpgz
2. Go to **Project Settings → API Keys** (or the API section shown in your dashboard).
3. Copy the **publishable key** for this project.
4. Do **not** copy a `service_role` key or a secret key into the website.

## 2. Run it on your computer

Install Node.js (LTS) from https://nodejs.org/ if it is not already installed.

1. Extract the ZIP.
2. Open the `fact-market` folder.
3. Copy `.env.example` and rename the copy to `.env`.
4. Replace the placeholder in `VITE_SUPABASE_PUBLISHABLE_KEY` with your publishable key.
5. Open a terminal in this folder and run:

```bash
npm install
npm run dev
```

6. Open the local address printed by Vite (usually http://localhost:5173).

## 3. Put the code on GitHub

1. Sign in at https://github.com/
2. Create a new repository named `fact-market`.
3. Upload the contents of this folder to the repository root.
4. Do not upload `.env` or any secret keys. `.gitignore` excludes `.env`.

## 4. Deploy on Vercel

1. Sign in at https://vercel.com/
2. Choose **Add New → Project** and import the `fact-market` GitHub repository.
3. Vercel should detect Vite automatically.
4. Add these Environment Variables in the Vercel project settings:

   - `VITE_SUPABASE_URL` = `https://iplpwpmwmgrpftwyfpgz.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = your Supabase **publishable** key

5. Deploy. Vercel will provide a public URL.

## 5. Allow your deployed domain in Supabase Auth

After Vercel gives you a domain:

1. In Supabase, open **Authentication → URL Configuration**.
2. Set the Site URL to your Vercel domain.
3. Add the Vercel domain to the Redirect URLs list.
4. Save, then test sign-up, email confirmation (if enabled), sign-in and sign-out.

For local testing, allow `http://localhost:5173` in the Redirect URLs list if your Auth configuration requires it.

## Notes / implementation assumptions

- The app uses UTC date to select `fm_daily_challenges.challenge_date`, matching the backend's UTC daily rollover.
- The app reads only safe question fields (`id`, `challenge_id`, `category`, `question_number`, `prompt`, `options`). It never requests `correct_option`.
- Answer correctness and explanations are returned by the database RPC, not calculated in the browser.
- All user balances and allocations are never written by the demo sliders.
- The app expects the existing database functions and views:
  `fm_lock_portfolio`, `fm_submit_answer`, `fm_market_demand`, `fm_global_leaderboard`.
- The demo controls are illustrative. The real market percentages come from the Supabase view.
- Before launch, confirm that your Supabase Auth email confirmation and password policies are configured, seed and verify all 15 daily questions, test concurrent users, and run Supabase security/performance advisors.
