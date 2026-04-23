---
title: RSSHub
emoji: 📡
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: RSSHub proxy for Scoop (X + Truth Social bridging)
---

# RSSHub for Scoop

Self-hosted [RSSHub](https://github.com/DIYgod/RSSHub) instance that
bridges X/Twitter, Truth Social, and hundreds of other sources into
clean RSS feeds.

Scoop (`backend/src/services/socialSignals.js`) calls:

- `GET /twitter/user/:handle`       – recent tweets from a public X user
- `GET /truthsocial/user/:handle`   – recent posts from a Truth Social user

## Deploying

1. Create a new Hugging Face Space, SDK = Docker.
2. Push this folder (Dockerfile + README) to the Space's `main` branch.
3. First build takes ~8 minutes.
4. Once live, copy the Space URL (e.g. `https://drjahanzeb-rsshub.hf.space`)
   into Scoop's backend env var:
   ```
   RSSHUB_URL=https://drjahanzeb-rsshub.hf.space
   ```
5. Restart the Scoop backend. The Live-tab dossier will start pulling
   X + Truth Social signals on the next hourly refresh.

## Notes

- No Redis — memory cache only (1 h TTL). Fine for Scoop's hourly refresh cadence.
- No API key required from Scoop's side. RSSHub handles the
  scraping/session cookies internally via puppeteer.
- If X changes its HTML layout, RSSHub's maintainers usually have a
  patch out within days. Pin to `diygod/rsshub:latest` to stay current.
