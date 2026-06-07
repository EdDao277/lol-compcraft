# CompCraft

CompCraft is a League of Legends draft assistant for premade teams. It helps track champion pools, run a manual blue/red draft board, and generate pick and ban recommendations from player comfort, draft rules, team composition needs, matchup stats, and an optional ML win-chance advisor.

The app can run as:

- a Vite React web app during development
- an Electron Windows desktop app
- a Supabase-backed app for teams, champion pools, and generated network stats
- a Python ML advisor served locally or hosted on Render

## App Description

CompCraft is built around a practical drafting workflow:

- Maintain team champion pools by player and role.
- Load/save teams through Supabase.
- Draft manually on a blue/red board in ranked/normal or tournament format.
- See pick ideas grouped by draft situation, such as first pick, response pick, flex pick, comfort pick, plan pick, counter pick, final pick, and comp fix.
- See ban ideas grouped by plan protection, enemy comfort, and flex/blind threat.
- Inspect short reasons and risks for each recommendation.
- Use a hosted or local ML advisor to estimate whether a candidate pick improves projected win chance.

The app is intentionally not an automatic drafter. It is a decision-support tool: it gives structured suggestions, then the drafter still applies team context, scrim knowledge, patch knowledge, and player confidence.

## How Scoring Works

Pick recommendations are built from every currently available champion in your players' pools. For each candidate, CompCraft calculates several partial scores.

Main pick inputs:

- Player fit: comfort score and whether the champion belongs to the player/role pool.
- Team need fit: missing AP/AD damage, frontline, engage, peel, crowd control, waveclear, scaling, and early pressure.
- Draft timing: first pick, red-side response, early, middle, or late draft.
- Counter value: known counters into revealed enemy picks and enemy pool threats.
- Safety value: blind-pick score, flexibility, mobility, waveclear, weak-side value, and risk tags.
- Statistical synergy: Supabase synergy rows for champion pairings.
- Network stats: champion role baselines and matchup deltas from crawled match data.
- Team-comp signature stats: historical win rates for comp shapes such as frontline, engage, peel, dive, poke, mixed damage, scaling, and waveclear.
- Rule-based advisor score: a general draft evaluator that combines draft timing, team needs, enemy comp shape, and current draft plan.
- ML win-chance gain: optional model score from the Python advisor.
- Risk penalty: penalties for early exposure, bad timing, low safety, weak matchup context, or missing critical team tools.

The final pick score is a weighted blend:

```text
ruleScore             30%
player comfort        25%
team need fit         20%
counter/synergy/stats 15%
predicted win gain    10%
minus risk penalty
```

The ML advisor does not replace the whole draft score. It specifically contributes the `predictedWinChanceGain` part. If the ML advisor is offline, CompCraft falls back to a neutral/rule-based win-gain estimate so recommendations still work.

Ban recommendations are scored from a different angle:

- Plan protection: remove champions that punish your current draft identity.
- Enemy comfort: remove known enemy pool threats.
- Flex/blind value: remove safe, flexible, hard-to-answer enemy options.
- Network matchup threat: remove champions that perform well into your revealed picks or that your pool answers poorly.
- Enemy team-comp signature threat: boost bans that would complete historically strong enemy comp shapes.

This means pick scores mostly ask "what should we play now?", while ban scores ask "what enemy option most damages our plan or enables theirs?"

## ML Advisor

The ML advisor is a Python HTTP service. The frontend calls:

```text
GET  /health
POST /predict-draft
```

The model currently loads:

```text
data/ml/models/draft_win_predictor.joblib
data/ml/training/supabase_network_stats.json
```

For hosted deployment, those artifacts are uploaded to Supabase Storage. The hosted service reads:

```env
MODEL_BUNDLE_URL=
NETWORK_STATS_URL=
```

If `NETWORK_STATS_URL` ends in `.gz`, the server downloads and decompresses it before loading. This keeps the large network stats artifact under Supabase free-tier upload limits.

The desktop/web app reads:

```env
VITE_ML_ADVISOR_URL=
```

For the current hosted Render service:

```env
VITE_ML_ADVISOR_URL=https://lol-compcraft-ml.onrender.com
```

Check service health:

```text
https://lol-compcraft-ml.onrender.com/health
```

You want:

```json
"ready": true
```

## Fresh Clone Setup

Install dependencies:

```bash
npm install
```

Restore local env files. These are gitignored and must be copied/recreated from the old folder or password manager:

```text
.env
.env.local
.env.pipeline
```

Typical `.env`:

```env
VITE_ML_ADVISOR_URL=https://lol-compcraft-ml.onrender.com
```

Typical `.env.local`:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Typical `.env.pipeline`:

```env
RIOT_API_KEY=your_riot_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Only `.env.local` and `.env` are needed to run/build the app. `.env.pipeline` is needed for crawl, upload, seed, and ML artifact scripts.

Run the web app:

```bash
npm run dev
```

Run the Electron shell during development in a second terminal:

```bash
npm run desktop:dev
```

Build the Windows installer:

```bash
npm run desktop:build
```

Installer output is written to:

```text
release/
```

Build a portable Windows executable:

```bash
npm run desktop:build:portable
```

## Supabase Setup

For a fresh Supabase project, run:

```text
supabase/setup_all.sql
```

For only the ML artifact bucket/table on an existing project, run:

```text
supabase/setup_ml_artifacts.sql
```

Development permissions are intentionally permissive right now because this is a personal/friends tool. The public desktop app uses the Supabase anon key. The crawl/upload scripts use the Supabase service role key and should stay local/server-side only.

## ML Artifact Upload

After training or exporting a new model/network stats file, upload artifacts to Supabase Storage:

```bash
npm run ml:upload-artifacts
```

The script uploads:

```text
data/ml/models/draft_win_predictor.joblib
data/ml/training/supabase_network_stats.json
```

The network stats JSON is uploaded compressed as:

```text
training/supabase_network_stats.json.gz
```

The script prints:

```env
MODEL_BUNDLE_URL=...
NETWORK_STATS_URL=...
```

Use those values in Render.

## Render ML Deployment

Render deploys the root `Dockerfile`.

Required environment variables:

```env
HOST=0.0.0.0
ALLOWED_ORIGINS=*
MODEL_BUNDLE_URL=https://your-model-url
NETWORK_STATS_URL=https://your-network-stats-json-gz-url
```

Do not manually set `PORT` unless Render asks you to. Render provides it, and the server reads it automatically.

After pushing Docker or server changes:

1. Open the Render service.
2. Click `Manual Deploy`.
3. Choose `Deploy latest commit`.
4. Open `/health`.
5. Confirm `"ready": true`.

Free Render services can sleep when idle, so the first ML request after inactivity may be slow.

## Local ML Advisor

If you want to run ML locally instead of Render, make sure the local model artifacts exist:

```text
data/ml/models/draft_win_predictor.joblib
data/ml/training/supabase_network_stats.json
```

Start the advisor:

```bash
npm run ml:advisor
```

Set:

```env
VITE_ML_ADVISOR_URL=http://127.0.0.1:8787
```

Check:

```bash
curl http://127.0.0.1:8787/health
```

## Generated Files And Folder Moves

Safe to delete and rebuild:

```text
node_modules/
dist/
release/
```

Generated or large files that are not needed for normal hosted-ML app usage:

```text
data/cache/
data/ml/models/
data/ml/training/
data/ml/oracle/
```

Keep or back up these private local files before moving folders:

```text
.env
.env.local
.env.pipeline
```

For normal app usage after a fresh clone, the most important values are Supabase anon config and `VITE_ML_ADVISOR_URL`.
