# Know Your Worth — investment allocation update

Implemented in the frontend and applied to the connected Supabase project.

- Daily portfolio remains exactly 100 FM.
- Each of the five categories accepts 0–40 FM.
- Each category must receive a positive investment at least once within the current plus previous two market sessions (weekends/holidays do not count because they have no challenge session).
- Backend validates category keys, integer amounts, per-category bounds, total budget and categories due before locking.
- Play screen shows a three-session rotation tracker with due/recently-invested status.

The migration is included at `supabase/migrations/20261111143300_flexible_allocation_three_session_investment_rotation.sql` for repository history. It has already been applied to Supabase project `iplpwpmwmgrpftwyfpgz`.

## Deploy

Replace the repository files with this ZIP and push to `main` (or merge the update into your current branch). GitHub Actions should publish the frontend. No second manual SQL run is needed; the migration has already been applied to the connected Supabase database.
