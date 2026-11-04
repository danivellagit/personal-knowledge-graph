# Connect a health wearable (the body layer)

**Optional.** About 30-60 minutes for the reference setup (Fitbit / Pixel Watch through the Google Health API),
most of it in the Google Cloud console. Then nothing: the token refreshes by itself (see the 7-day caveat below).

The body layer (anatomy.md, "The body layer") turns your wearable's raw data into one file per day in
`data/body/`: sleep and its stages, heart rate by the hour, steps, sessions, and who you were with. It is used by
the fitness coach and the health advisor, and by the Life App's Body page. Raw data and the SQLite store stay
**outside the repo**; only the day files go in `data/`. A number is a fact, its meaning is not: the tools never
write "stressed" next to a heart rate.

## What is wired: Google Health API (Fitbit, Pixel Watch)

`tools/body-pull.sh` talks to the wearable through a command-line client that answers
`<cli> data <type> list --from D --to D --limit N` and `<cli> data <type> daily-rollup --from D --to D` with JSON.
The reference client is Google's own open-source **ghealth** CLI for the Google Health API v4 (40 data types:
steps, heart rate, sleep, HRV, SpO2, exercise, weight...). The Google Health API replaces the legacy Fitbit Web API.

1. **Check you can get access first.** You need your own Google Cloud project with the Google Health API enabled
   and an OAuth client of type *Desktop application*. When the reference instance was set up, Google said it was
   not yet onboarding every new project: if the API is not available to you, stop here (mark it `later`).
2. **Build the CLI** (needs Go):

   ```bash
   git clone https://github.com/Google-Health-API/google-health-cli.git ~/tools/google-health-cli
   cd ~/tools/google-health-cli && go build -o ghealth .
   ```

3. **Set it up and log in, yourself** (an agent never runs a login for you):

   ```bash
   ~/tools/google-health-cli/ghealth setup        # project id, the OAuth client JSON, scopes (choose read-only)
   ```

   On a machine without a browser: `ghealth auth login --non-interactive --scopes-preset readonly`, open the
   printed URL on any device, then `ghealth auth login --complete <code>`. Tokens live in `~/.config/ghealth/`
   (outside the repo). **If your OAuth app stays in "Testing", Google expires the login every 7 days**: put the
   date in your credentials list, or publish the app for your own account.
4. **Point the repo at it** in `config.local.yml`:

   ```yaml
   body:
     enabled: true
     cli: "~/tools/google-health-cli/ghealth"
     raw_dir: "~/health/wearable/raw"      # outside the repo
     db: "~/health/health.db"              # outside the repo
     first_day: "2030-01-01"               # the first day you want
     # height_cm, sex, sources, device: see the body block in config.example.yml
   ```

5. **First pull and the day files:**

   ```bash
   tools/body-pull.sh 2030-01-01 && python3 tools/body.py ingest && python3 tools/body.py days 2030-01-01
   ```

   Then the daily loop in `CLAUDE.md` (section 4) pulls the last three days on every run. Also available:
   `tools/sleep_fields.py`, `tools/calories.py day YYYY-MM-DD`, `tools/body.py window <from> <to>`.

## Other wearables: untested

**Oura, WHOOP, Garmin, Apple Health / Apple Watch, Samsung Health, Withings** and others have their own APIs or
exports. None of them is wired or tested here. To use one, you (or your agent, on your yes) write a small client
or converter that produces the same raw layout `tools/body.py ingest` reads (one JSON file per data type per day
under `body.raw_dir`, as the ghealth CLI writes it), or a CLI with the two commands above. Until then mark the
item `skipped` or `later`; every other part of the repo works without a body layer.

Related: [`anatomy.md`](../../anatomy.md) ("The body layer"), `tools/body-pull.sh`, `tools/body.py`,
[`INSTALL.md`](../../INSTALL.md).
