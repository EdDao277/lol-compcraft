# lol-compcraft
A manual League of Legends draft assistant for premade teams, champion pools, picks, bans, and team comp recommendations.

## Desktop app

CompCraft can run as an Electron desktop app while still using Supabase and the ML advisor over HTTP.

Install dependencies:

```bash
npm install
```

Run the web app during development:

```bash
npm run dev
```

Run the desktop shell during development in a second terminal:

```bash
npm run desktop:dev
```

Build a Windows installer:

```bash
npm run desktop:build
```

The installer output is written to `release/`.

Build a portable Windows executable instead:

```bash
npm run desktop:build:portable
```

## ML advisor API

The frontend reads `VITE_ML_ADVISOR_URL`. For local development, leave it as:

```env
VITE_ML_ADVISOR_URL=http://127.0.0.1:8787
```

Start the local Python ML advisor:

```bash
npm run ml:advisor
```

Check that the local ML advisor can see the trained model:

```bash
curl http://127.0.0.1:8787/health
```

The response should include `"ready": true`.

### Hosted ML advisor

For a hosted ML advisor, first create the Supabase Storage bucket and metadata table:

1. Open Supabase SQL Editor.
2. Paste and run `supabase/setup_ml_artifacts.sql`.

Then upload the current model artifacts:

```bash
npm run ml:upload-artifacts
```

The upload script reads `.env.pipeline`, uses `SUPABASE_SERVICE_ROLE_KEY`, uploads these files to Supabase Storage, and prints the URLs needed by the hosted ML service:

- `data/ml/models/draft_win_predictor.joblib`
- `data/ml/training/supabase_network_stats.json`

Deploy the root `Dockerfile` to a container host and set the ML service environment variables from that upload output. `Dockerfile.ml` is kept as an explicit copy if you want to point a host at a named Dockerfile instead.

```env
HOST=0.0.0.0
PORT=8787
ALLOWED_ORIGINS=*
MODEL_BUNDLE_URL=https://your-public-file-url/draft_win_predictor.joblib
NETWORK_STATS_URL=https://your-public-file-url/supabase_network_stats.json
```

Most container hosts provide their own `PORT` value. The server reads that value automatically.

After deployment:

1. Open `https://your-ml-advisor.example.com/health`.
2. Confirm the response says `"ready": true`.
3. Set the desktop/web app environment variable to the public service URL before building:

```env
VITE_ML_ADVISOR_URL=https://your-ml-advisor.example.com
```

4. Rebuild the desktop app:

```bash
npm run desktop:build
```

5. Install the new `.exe` from `release/`.

The crawl/upload pipeline should stay developer-only because it uses the Supabase service role key. The desktop app should keep using the public Supabase anon key.
