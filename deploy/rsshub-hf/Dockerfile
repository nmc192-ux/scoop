# RSSHub on Hugging Face Spaces (Docker SDK, free CPU Basic)
#
# Bridges X/Twitter and Truth Social (and hundreds of other sites) into
# RSS feeds that Scoop's socialSignals.js ingests. Self-hosting avoids
# the public-instance rate limits we'd hit with https://rsshub.app.
#
# After pushing this Space, set RSSHUB_URL in the Scoop backend env:
#   RSSHUB_URL=https://<user>-rsshub.hf.space

FROM diygod/rsshub:latest

# HF Spaces must listen on $PORT=7860. RSSHub defaults to 1200; override
# via env so we don't patch the upstream image.
ENV PORT=7860

# Minimal caching — memory-only (1 h) so ephemeral restarts don't need
# a redis sidecar (which HF free tier can't host cheaply).
ENV CACHE_TYPE=memory
ENV CACHE_EXPIRE=3600
ENV CACHE_CONTENT_EXPIRE=3600

# Hide the "Demo" banner and disable the built-in debug endpoints so
# third-party traffic can't DOS us.
ENV DISALLOW_ROBOT=true
ENV NO_LOGFILES=true

# HF injects a read-only filesystem outside /tmp and /data. RSSHub's
# puppeteer fallback writes cookies there — point it at /tmp.
ENV PUPPETEER_CACHE_DIR=/tmp/puppeteer

EXPOSE 7860

# Upstream entrypoint already launches `node lib/index.js`. We only need
# to make sure it binds to 0.0.0.0:7860 — the default server.js respects
# $PORT.
