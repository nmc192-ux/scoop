# LibreTranslate on Hugging Face Spaces
# Free 16GB CPU Basic Space — enough for ~17 languages, always-on.
#
# Build notes:
#   - HF Spaces require the runtime user to have UID 1000.
#   - LibreTranslate binds 0.0.0.0:5000 (HF picks up via app_port in README).
#   - Models download on first request per language pair (~30s each).
#     They're cached on the Space's persistent layer until a rebuild.

FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      curl \
    && rm -rf /var/lib/apt/lists/*

# HF Spaces mandate a non-root UID 1000 user.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    ARGOS_PACKAGES_DIR=/home/user/.argos \
    LT_LOAD_ONLY=en,es,fr,de,it,pt,nl,ru,tr,pl,ar,fa,ur,hi,zh,ja,ko \
    LT_DISABLE_WEB_UI=true \
    LT_HOST=0.0.0.0 \
    LT_PORT=5000 \
    LT_CHAR_LIMIT=5000 \
    LT_REQ_LIMIT=0

WORKDIR /home/user/app

RUN pip install --user --no-cache-dir libretranslate

EXPOSE 5000

# --disable-web-ui keeps the Space headless (Scoop only uses the JSON API).
CMD ["libretranslate", \
     "--host", "0.0.0.0", \
     "--port", "5000", \
     "--disable-web-ui", \
     "--load-only", "en,es,fr,de,it,pt,nl,ru,tr,pl,ar,fa,ur,hi,zh,ja,ko"]
