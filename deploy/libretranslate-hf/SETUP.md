# Deploying Scoop's LibreTranslate to Hugging Face Spaces

One-time setup, ~5 minutes. Free forever (CPU Basic tier: 16 GB RAM, 2 vCPU,
always-on, no credit card).

## 1. Create an HF account

https://huggingface.co/join — free, email only.

## 2. Create the Space

1. Go to https://huggingface.co/new-space
2. Fill in:
   - **Owner**: your username
   - **Space name**: `libretranslate` (or whatever you like)
   - **License**: `agpl-3.0`
   - **SDK**: **Docker** → choose "Blank"
   - **Hardware**: `CPU basic (free)`
   - **Visibility**: Public
3. Click **Create Space**.

## 3. Upload the two files in this folder

Either via the HF web UI (Files → Add file → Upload files), or via git:

```bash
git clone https://huggingface.co/spaces/<your-username>/libretranslate
cd libretranslate
cp /path/to/scoop-news/deploy/libretranslate-hf/Dockerfile .
cp /path/to/scoop-news/deploy/libretranslate-hf/README.md .
git add Dockerfile README.md
git commit -m "Initial LibreTranslate Space"
git push
```

HF auto-builds on push (~5–8 min the first time).

## 4. Test it

Once the Space shows a green "Running" badge:

```bash
curl -sS https://<your-username>-libretranslate.hf.space/languages | head -c 200
# → [{"code":"en","name":"English","targets":[...]}, ...]

curl -sS -X POST https://<your-username>-libretranslate.hf.space/translate \
  -H 'Content-Type: application/json' \
  -d '{"q":"Hello world","source":"en","target":"fr","format":"text"}'
# → {"translatedText":"Bonjour le monde"}
```

First translation per language pair takes ~30 s (model download). After
that it's instant.

## 5. Point Scoop at it

In Hostinger hPanel → `scoopfeeds.com` → Node.js app → **Environment
Variables**, add:

```
LIBRETRANSLATE_URL=https://<your-username>-libretranslate.hf.space
```

Restart the app. Done. Every translation in Scoop now goes to your free
Space; MyMemory becomes a fallback only.

## Verify it's wired up

```bash
curl -s https://scoopfeeds.com/api/translate/cache-stats
# → {"success":true,"cached":N,"providers":["libretranslate","mymemory"]}
```

Then open Scoop, pick a non-English language, and watch the feed translate.
After a minute of scrolling, `cached` should climb — every unique
headline is saved in SQLite so repeat visits never call LibreTranslate
again.

## Notes & gotchas

- **Cold starts**: HF may pause a free Space after prolonged idle (check
  your Space settings → "sleep after"). If it sleeps, the first request
  after wake takes ~30 s; Scoop's 60 s circuit breaker will briefly
  fall through to MyMemory during wake-up, then resume on LibreTranslate.
- **Language list**: trim `LT_LOAD_ONLY` in the Dockerfile if you want
  faster builds. Each language pair is ~100 MB.
- **Public Space**: anyone can hit your `/translate` endpoint. That's
  fine — LibreTranslate is AGPL and Scoop caches everything server-side.
  If you want to gate it, set `LT_API_KEYS=<random-string>` and
  `LIBRETRANSLATE_API_KEY=<same>` on Hostinger.
- **Upgrading**: free CPU Basic is enough for Scoop's traffic. If
  translations ever queue, upgrade the Space hardware from the Settings
  tab — no code change needed.
