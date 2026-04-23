---
title: Scoop LibreTranslate
emoji: 🌐
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 5000
pinned: false
license: agpl-3.0
short_description: Free self-hosted LibreTranslate API for Scoop.
---

# Scoop LibreTranslate

Free, unlimited translation API that powers [Scoop](https://scoopfeeds.com).
Runs LibreTranslate with 17 languages loaded (English, Spanish, French,
German, Italian, Portuguese, Dutch, Russian, Turkish, Polish, Arabic,
Persian, Urdu, Hindi, Chinese, Japanese, Korean).

## Endpoints

- `GET  /languages` — list of supported language codes
- `POST /translate` — translate text
  ```json
  {"q": "Hello world", "source": "en", "target": "fr", "format": "text"}
  ```

## License

LibreTranslate is AGPL-3.0. This Space inherits that license.
