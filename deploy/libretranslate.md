# Self-hosted LibreTranslate — free, unlimited translations

Scoop's translator uses LibreTranslate as the first provider in its fallback
chain. When you run your own instance on the VPS, translations become free,
unlimited, and fast (no network hop).

## 1. Resource budget

| Language load          | RAM needed | Disk |
| ---------------------- | ---------- | ---- |
| English ↔ 3–4 languages | ~1.5 GB    | ~2 GB |
| English ↔ ~10          | ~2.5 GB    | ~5 GB |
| All (40+)              | ~4 GB      | ~10 GB |

If your Hostinger VPS is 4 GB+ you can host the full set. On a 2 GB box,
restrict languages with `LT_LOAD_ONLY`.

## 2. Run with Docker (one command)

```bash
docker run -d \
  --name libretranslate \
  --restart unless-stopped \
  -p 127.0.0.1:5000:5000 \
  -e LT_LOAD_ONLY=en,es,fr,de,it,pt,nl,ru,tr,pl,ar,fa,ur,hi,zh,ja,ko \
  libretranslate/libretranslate
```

First boot downloads models (~5–10 min). After that, it starts in seconds.
Health check: `curl http://127.0.0.1:5000/languages`.

## 3. Point Scoop at it

In your backend `.env` (or systemd unit):

```
LIBRETRANSLATE_URL=http://127.0.0.1:5000
```

Restart the backend. That's it — every translation now goes to your
instance. No API key, no quota.

## 4. Optional: public mirror instead

Don't want to run Docker? Use a public instance — less reliable but
zero-setup:

```
LIBRETRANSLATE_URL=https://libretranslate.com
LIBRETRANSLATE_API_KEY=<sign up at libretranslate.com for a free key>
```

Public instances rate-limit aggressively; the code circuit-breaks for 60 s
on any 5xx or timeout and falls through to MyMemory, so the feed never
stalls.

## 5. Verifying it works

```bash
curl -s http://127.0.0.1:5000/translate \
  -H 'Content-Type: application/json' \
  -d '{"q":"Hello world","source":"en","target":"fr","format":"text"}'
# → {"translatedText":"Bonjour le monde"}
```

Then check Scoop's stats:

```bash
curl -s https://scoopfeeds.com/api/translate/cache-stats
# → {"success":true,"cached":N,"providers":["libretranslate","mymemory"]}
```

If `libretranslate` is in `providers`, it's wired up.
