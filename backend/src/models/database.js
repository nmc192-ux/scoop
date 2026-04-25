import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { logger } from "../services/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, "news.db");
let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("cache_size = 10000");
    db.pragma("temp_store = MEMORY");
    initializeSchema(db);
    logger.info("Database initialized", { path: DB_PATH });
  }
  return db;
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT,
      content     TEXT,
      url         TEXT UNIQUE NOT NULL,
      image_url   TEXT,
      source_name TEXT NOT NULL,
      category    TEXT NOT NULL,
      region      TEXT DEFAULT 'global',
      author      TEXT,
      published_at INTEGER NOT NULL,
      fetched_at  INTEGER NOT NULL,
      credibility INTEGER DEFAULT 8,
      is_featured INTEGER DEFAULT 0,
      view_count  INTEGER DEFAULT 0,
      tags        TEXT DEFAULT '[]',
      language    TEXT DEFAULT 'en'
    );

    CREATE INDEX IF NOT EXISTS idx_articles_category   ON articles(category);
    CREATE INDEX IF NOT EXISTS idx_articles_published  ON articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_featured   ON articles(is_featured);
    CREATE INDEX IF NOT EXISTS idx_articles_source     ON articles(source_name);

    CREATE TABLE IF NOT EXISTS videos (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT,
      url          TEXT UNIQUE NOT NULL,
      video_id     TEXT NOT NULL,
      thumbnail    TEXT,
      channel_name TEXT NOT NULL,
      channel_id   TEXT,
      category     TEXT NOT NULL,
      region       TEXT DEFAULT 'global',
      published_at INTEGER NOT NULL,
      fetched_at   INTEGER NOT NULL,
      view_count   INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_videos_category    ON videos(category);
    CREATE INDEX IF NOT EXISTS idx_videos_published   ON videos(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_videos_channel     ON videos(channel_name);

    CREATE TABLE IF NOT EXISTS ingestion_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source_name TEXT NOT NULL,
      category    TEXT NOT NULL,
      status      TEXT NOT NULL,
      articles_fetched INTEGER DEFAULT 0,
      articles_new     INTEGER DEFAULT 0,
      error_msg   TEXT,
      duration_ms INTEGER,
      fetched_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_health (
      source_name TEXT PRIMARY KEY,
      last_success INTEGER,
      last_failure INTEGER,
      consecutive_failures INTEGER DEFAULT 0,
      total_fetches INTEGER DEFAULT 0,
      total_articles INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type  TEXT NOT NULL,
      article_id  TEXT,
      category    TEXT,
      ip_hash     TEXT,
      user_agent_hash TEXT,
      metadata    TEXT DEFAULT '{}',
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscribers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT NOT NULL UNIQUE,
      country_code TEXT,
      language     TEXT DEFAULT 'en',
      topics       TEXT DEFAULT '[]',
      token        TEXT NOT NULL,
      verified_at  INTEGER,
      unsubscribed_at INTEGER,
      created_at   INTEGER NOT NULL,
      last_sent_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
    CREATE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers(token);

    -- ─── Push notification subscriptions ──────────────────────────────────
    -- One row per browser+device opt-in. The endpoint URL is unique per
    -- subscription (browsers re-issue if the user clears storage). p256dh
    -- and auth are the per-subscription crypto keys we need to encrypt
    -- payloads. Topics is a JSON array of category strings the user opted
    -- into; empty/null means "all breaking news only".
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint    TEXT NOT NULL UNIQUE,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL,
      topics      TEXT DEFAULT '[]',
      country     TEXT,
      language    TEXT DEFAULT 'en',
      user_agent  TEXT,
      created_at  INTEGER NOT NULL,
      last_sent_at INTEGER,
      failure_count INTEGER DEFAULT 0,
      disabled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);
    CREATE INDEX IF NOT EXISTS idx_push_active ON push_subscriptions(disabled_at);

    -- Tracks which articles have already been broadcast as a push, so the
    -- breaking-news worker never pushes the same story twice (one row per
    -- article × topic — most rows will have topic = '*' for the global
    -- broadcast).
    CREATE TABLE IF NOT EXISTS pushed_articles (
      article_id TEXT NOT NULL,
      topic      TEXT NOT NULL DEFAULT '*',
      pushed_at  INTEGER NOT NULL,
      sent       INTEGER DEFAULT 0,
      failed     INTEGER DEFAULT 0,
      PRIMARY KEY (article_id, topic)
    );
    CREATE INDEX IF NOT EXISTS idx_pushed_recency ON pushed_articles(pushed_at);

    -- Audit log of every outbound social post. Unique on (article, platform)
    -- so the same article never posts twice to the same network. The
    -- platform_post_id + url come back from the platform's API and are
    -- handy for later metrics fetching + manual moderation.
    CREATE TABLE IF NOT EXISTS social_posts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id      TEXT NOT NULL,
      platform        TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'posted',
      platform_post_id TEXT,
      url             TEXT,
      caption         TEXT,
      error           TEXT,
      posted_at       INTEGER NOT NULL,
      UNIQUE(article_id, platform)
    );
    CREATE INDEX IF NOT EXISTS idx_social_recency ON social_posts(posted_at);
    CREATE INDEX IF NOT EXISTS idx_social_platform ON social_posts(platform, posted_at);

    -- ─── Tips (Stripe donations) ──────────────────────────────────────
    -- One row per completed Stripe Checkout payment. Populated by the
    -- /api/tips/webhook handler on checkout.session.completed events.
    CREATE TABLE IF NOT EXISTS tips (
      id              TEXT PRIMARY KEY,   -- Stripe checkout session id
      amount_cents    INTEGER NOT NULL,
      currency        TEXT NOT NULL DEFAULT 'usd',
      email           TEXT,               -- Stripe provides this on success
      message         TEXT,               -- optional note from donor (future)
      status          TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | failed
      stripe_pi       TEXT,               -- payment_intent id
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tips_created ON tips(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tips_status  ON tips(status);

    -- ─── Magic-link Auth ─────────────────────────────────────────────
    -- users: one row per verified email. Stores cross-device preferences.
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,          -- UUID v4
      email        TEXT NOT NULL UNIQUE,
      created_at   INTEGER NOT NULL,
      last_login_at INTEGER,
      preferred_topics  TEXT DEFAULT '[]',    -- JSON array of category strings
      preferred_country TEXT,
      language     TEXT DEFAULT 'en',
      subscriber_token TEXT                   -- FK to subscribers.token (nullable)
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- One-time magic-link tokens. Expire after 30 min; can only be used once.
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token      TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens(email);

    -- Per-device sessions. Set as httpOnly cookie; expire after 30 days.
    CREATE TABLE IF NOT EXISTS user_sessions (
      id         TEXT PRIMARY KEY,            -- session token (random hex)
      user_id    TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

    -- ─── Live Events (the "Live" tab) ──────────────────────────────────
    -- One row per tracked global event. The full dossier (brief points +
    -- metrics) is stored as JSON blobs so the shape can evolve without
    -- migrations. Config lives in src/config/liveEvents.js; this table
    -- just caches the synthesized output so the frontend reads quickly.
    CREATE TABLE IF NOT EXISTS live_events (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      subtitle    TEXT,
      emoji       TEXT,
      status      TEXT DEFAULT 'active',
      region      TEXT,
      brief       TEXT DEFAULT '[]',    -- JSON: [{ ts, text, sources: [{name,url}] }, ...]
      metrics     TEXT DEFAULT '{}',    -- JSON: { casualties: {...}, economicLoss: {...}, ... }
      summary     TEXT,                 -- 1-2 sentence headline for the list view
      updated_at  INTEGER NOT NULL,
      ceasefire_at INTEGER              -- optional ISO timestamp as ms since epoch
    );
  `);

  // Lightweight migration: add `language` column on existing deployments.
  try {
    const cols = db.prepare("PRAGMA table_info(articles)").all();
    if (!cols.some((c) => c.name === "language")) {
      db.exec("ALTER TABLE articles ADD COLUMN language TEXT DEFAULT 'en'");
      logger.info("Migrated articles table: +language");
    }
  } catch (err) {
    logger.warn("Migration check failed", { error: err.message });
  }

  // Migration: add referred_by_token + referral_count to subscribers.
  try {
    const cols = db.prepare("PRAGMA table_info(subscribers)").all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("referred_by_token")) {
      db.exec("ALTER TABLE subscribers ADD COLUMN referred_by_token TEXT");
      logger.info("Migrated subscribers table: +referred_by_token");
    }
  } catch (err) {
    logger.warn("Migration check (subscribers) failed", { error: err.message });
  }

  // FTS5 full-text search virtual table + sync triggers
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
        title, description, content, source_name,
        content='articles', content_rowid='rowid', tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
        INSERT INTO articles_fts(rowid, title, description, content, source_name)
        VALUES (new.rowid, new.title, new.description, new.content, new.source_name);
      END;
      CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
        INSERT INTO articles_fts(articles_fts, rowid, title, description, content, source_name)
        VALUES('delete', old.rowid, old.title, old.description, old.content, old.source_name);
      END;
      CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
        INSERT INTO articles_fts(articles_fts, rowid, title, description, content, source_name)
        VALUES('delete', old.rowid, old.title, old.description, old.content, old.source_name);
        INSERT INTO articles_fts(rowid, title, description, content, source_name)
        VALUES (new.rowid, new.title, new.description, new.content, new.source_name);
      END;
    `);

    // Backfill if FTS is empty but articles exist
    const ftsCount = db.prepare("SELECT COUNT(*) as n FROM articles_fts").get().n;
    const artCount = db.prepare("SELECT COUNT(*) as n FROM articles").get().n;
    if (ftsCount === 0 && artCount > 0) {
      db.exec(`INSERT INTO articles_fts(rowid, title, description, content, source_name)
               SELECT rowid, title, description, content, source_name FROM articles`);
      logger.info("FTS5 backfilled", { count: artCount });
    }
  } catch (err) {
    logger.warn("FTS5 init failed, falling back to LIKE search", { error: err.message });
  }
}

function ftsAvailable(db) {
  try {
    db.prepare("SELECT 1 FROM articles_fts LIMIT 1").get();
    return true;
  } catch { return false; }
}

function escapeFts(q) {
  // Quote each token for safe FTS5 MATCH: "foo"* "bar"*
  return q.trim().split(/\s+/).filter(Boolean)
    .map(t => `"${t.replace(/"/g, '""')}"*`).join(" ");
}

// ─── Article Operations ────────────────────────────────────────────────────

export function upsertArticle(article) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO articles
      (id, title, description, content, url, image_url, source_name,
       category, region, author, published_at, fetched_at, credibility, tags, language)
    VALUES
      (@id, @title, @description, @content, @url, @image_url, @source_name,
       @category, @region, @author, @published_at, @fetched_at, @credibility, @tags,
       COALESCE(@language, 'en'))
  `).run(article);
}

export function getArticles({
  category,
  categories = null,   // array of categories to OR-match (new; beats `category`)
  regions = null,      // array of region values to OR-match (Local tab)
  limit = 50,
  offset = 0,
  search = null,
  minCredibility = 0,
  source = null,
}) {
  const db = getDb();
  const useFts = search && ftsAvailable(db);
  let query = useFts
    ? `SELECT articles.* FROM articles JOIN articles_fts ON articles.rowid = articles_fts.rowid
       WHERE articles_fts MATCH ? AND credibility >= ?`
    : `SELECT * FROM articles WHERE credibility >= ?`;
  const params = useFts ? [escapeFts(search), minCredibility] : [minCredibility];

  // Multi-category OR (new tab model). Fallback to single-category for back-compat.
  if (Array.isArray(categories) && categories.length > 0) {
    query += ` AND category IN (${categories.map(() => "?").join(",")})`;
    params.push(...categories);
  } else if (category && category !== "top") {
    query += ` AND category = ?`;
    params.push(category);
  }

  // Region filter (used for the Local tab — resolved from user's country).
  if (Array.isArray(regions) && regions.length > 0) {
    query += ` AND region IN (${regions.map(() => "?").join(",")})`;
    params.push(...regions);
  }

  if (source) { query += ` AND source_name = ?`; params.push(source); }
  if (search && !useFts) { query += ` AND (title LIKE ? OR description LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }

  // For the mixed "top" feed (no category filter), bucket into 3-hour windows then
  // prioritise by editorial weight so politics/international rise above sports/cars.
  // Single-category views use plain recency (all articles share the same priority).
  const hasCategoryFilter =
    (Array.isArray(categories) && categories.length > 0) ||
    (category && category !== "top");
  const isMixedFeed = !hasCategoryFilter;
  query += isMixedFeed
    ? ` ORDER BY (published_at / 10800000) DESC,
        CASE category
          WHEN 'top'          THEN 1
          WHEN 'politics'     THEN 2
          WHEN 'pakistan'     THEN 3
          WHEN 'international'THEN 4
          WHEN 'science'      THEN 5
          WHEN 'medicine'     THEN 5
          WHEN 'public-health'THEN 5
          WHEN 'health'       THEN 6
          WHEN 'environment'  THEN 7
          WHEN 'self-help'    THEN 8
          WHEN 'sports'       THEN 9
          WHEN 'cars'         THEN 10
          ELSE 6
        END ASC,
        credibility DESC, published_at DESC LIMIT ? OFFSET ?`
    : ` ORDER BY published_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(query).all(...params);
}

export function getFeaturedArticles(limit = 7) {
  return getDb().prepare(`
    SELECT * FROM articles WHERE credibility >= 8
    ORDER BY
      (published_at / 10800000) DESC,
      CASE category
        WHEN 'top'          THEN 1
        WHEN 'politics'     THEN 2
        WHEN 'pakistan'     THEN 3
        WHEN 'international'THEN 4
        WHEN 'science'      THEN 5
        WHEN 'medicine'     THEN 5
        WHEN 'public-health'THEN 5
        WHEN 'health'       THEN 6
        WHEN 'environment'  THEN 7
        WHEN 'self-help'    THEN 8
        WHEN 'sports'       THEN 9
        WHEN 'cars'         THEN 10
        ELSE 6
      END ASC,
      credibility DESC, published_at DESC
    LIMIT ?
  `).all(limit);
}

export function getArticleById(id)    { return getDb().prepare("SELECT * FROM articles WHERE id = ?").get(id); }
export function incrementViewCount(id){ getDb().prepare("UPDATE articles SET view_count = view_count + 1 WHERE id = ?").run(id); }

// Cross-source coverage — other sources covering the same story, used by the
// article SSR page to build a "Also covered by" block. This is what turns our
// page from "scraped rewrite" into aggregation with genuine editorial value.
// Matches on 2-3 meaningful title tokens across the last 3 days, excluding
// the article itself and its own source.
export function listAlternateCoverage(article, limit = 4) {
  if (!article || !article.title) return [];
  const tokens = article.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4)
    .filter((t) => !STOPWORDS.has(t))
    .slice(0, 5);
  if (tokens.length < 2) return [];
  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const likes = tokens.map(() => `LOWER(title) LIKE ?`).join(" OR ");
  const params = [
    article.id,
    article.source_name || "",
    cutoff,
    ...tokens.map((t) => `%${t}%`),
    limit,
  ];
  return getDb().prepare(`
    SELECT id, title, url, source_name, published_at, category, image_url
    FROM articles
    WHERE id != ? AND source_name != ? AND published_at > ?
      AND (${likes})
    ORDER BY published_at DESC
    LIMIT ?
  `).all(...params);
}

// Related stories — same category, different URL, sorted by recency. Used on
// the article SSR page to increase internal linking + pages-per-session.
export function listRelatedStories(article, limit = 5) {
  if (!article) return [];
  return getDb().prepare(`
    SELECT id, title, source_name, published_at, category, image_url
    FROM articles
    WHERE id != ? AND category = ? AND published_at > ?
    ORDER BY published_at DESC
    LIMIT ?
  `).all(
    article.id,
    article.category,
    Date.now() - 3 * 24 * 60 * 60 * 1000,
    limit,
  );
}

const STOPWORDS = new Set([
  "about", "after", "again", "against", "could", "during", "first", "from",
  "have", "having", "here", "into", "more", "most", "over", "says", "such",
  "their", "there", "these", "they", "this", "through", "under", "until",
  "what", "when", "where", "which", "while", "with", "would", "your", "that",
  "will", "been", "were", "also", "just", "than", "them", "then", "some",
  "very", "only", "even", "many", "much", "must", "make", "made", "back",
  "before", "between", "other", "still", "those", "while", "against", "among",
  "because", "being", "both", "each", "every", "however", "same", "should",
]);

export function getTopicCounts() {
  return getDb().prepare(`SELECT category, COUNT(*) as count FROM articles GROUP BY category ORDER BY count DESC`).all();
}

export function getArticleCount() { return getDb().prepare("SELECT COUNT(*) as count FROM articles").get(); }

export function pruneOldArticles(daysToKeep = 7) {
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  const a = getDb().prepare("DELETE FROM articles WHERE fetched_at < ?").run(cutoff);
  const v = getDb().prepare("DELETE FROM videos WHERE fetched_at < ?").run(cutoff);
  return a.changes + v.changes;
}

// ─── Video Operations ──────────────────────────────────────────────────────

export function upsertVideo(video) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO videos
      (id, title, description, url, video_id, thumbnail, channel_name, channel_id,
       category, region, published_at, fetched_at)
    VALUES
      (@id, @title, @description, @url, @video_id, @thumbnail, @channel_name, @channel_id,
       @category, @region, @published_at, @fetched_at)
  `).run(video);
}

export function getVideos({ category, limit = 20, offset = 0 } = {}) {
  const db = getDb();
  let query = `SELECT * FROM videos WHERE 1=1`;
  const params = [];
  if (category && category !== "top") { query += ` AND category = ?`; params.push(category); }
  query += ` ORDER BY published_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(query).all(...params);
}

export function getVideosByCategories(categories, limit = 12) {
  const db = getDb();
  if (!categories || categories.length === 0) {
    return db.prepare(`SELECT * FROM videos ORDER BY published_at DESC LIMIT ?`).all(limit);
  }
  const ph = categories.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM videos WHERE category IN (${ph}) ORDER BY published_at DESC LIMIT ?`).all(...categories, limit);
}

export function getVideoCount() { return getDb().prepare("SELECT COUNT(*) as count FROM videos").get(); }

// ─── Ingestion Logs ────────────────────────────────────────────────────────

export function logIngestionEvent(data) {
  getDb().prepare(`
    INSERT INTO ingestion_logs
      (source_name, category, status, articles_fetched, articles_new, error_msg, duration_ms, fetched_at)
    VALUES
      (@source_name, @category, @status, @articles_fetched, @articles_new, @error_msg, @duration_ms, @fetched_at)
  `).run(data);
}

export function updateSourceHealth(sourceName, success, count = 0) {
  const db = getDb();
  const now = Date.now();
  if (success) {
    db.prepare(`
      INSERT INTO source_health (source_name, last_success, consecutive_failures, total_fetches, total_articles)
      VALUES (?, ?, 0, 1, ?)
      ON CONFLICT(source_name) DO UPDATE SET
        last_success = excluded.last_success,
        consecutive_failures = 0,
        total_fetches = total_fetches + 1,
        total_articles = total_articles + ?
    `).run(sourceName, now, count, count);
  } else {
    db.prepare(`
      INSERT INTO source_health (source_name, last_failure, consecutive_failures, total_fetches)
      VALUES (?, ?, 1, 1)
      ON CONFLICT(source_name) DO UPDATE SET
        last_failure = excluded.last_failure,
        consecutive_failures = consecutive_failures + 1,
        total_fetches = total_fetches + 1
    `).run(sourceName, now);
  }
}

export function getSourceHealth() {
  return getDb().prepare("SELECT * FROM source_health ORDER BY total_articles DESC").all();
}

// ─── Analytics ────────────────────────────────────────────────────────────

export function trackEvent(eventType, data = {}) {
  getDb().prepare(`
    INSERT INTO analytics (event_type, article_id, category, ip_hash, user_agent_hash, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(eventType, data.articleId||null, data.category||null, data.ipHash||null, data.uaHash||null, JSON.stringify(data.metadata||{}), Date.now());
}

export function getAnalyticsSummary() {
  const db = getDb();
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return {
    totalArticles:    db.prepare("SELECT COUNT(*) as n FROM articles").get().n,
    totalVideos:      db.prepare("SELECT COUNT(*) as n FROM videos").get().n,
    articlesToday:    db.prepare("SELECT COUNT(*) as n FROM articles WHERE fetched_at > ?").get(oneDayAgo).n,
    topCategories:    db.prepare("SELECT category, COUNT(*) as n FROM articles GROUP BY category ORDER BY n DESC LIMIT 5").all(),
    recentIngestions: db.prepare("SELECT * FROM ingestion_logs ORDER BY fetched_at DESC LIMIT 20").all(),
    sourceHealth:     getSourceHealth(),
  };
}

// ─── Live Events (dossier cache) ──────────────────────────────────────────
// Articles related to an event are looked up via keyword OR-match. We rank
// preferred sources (e.g. Al Jazeera for Middle East) higher so the
// synthesizer has trustworthy material to work with.
export function findArticlesForEvent({ keywords = [], preferredSources = [], limit = 30 } = {}) {
  if (keywords.length === 0) return [];
  const db = getDb();
  const likeClauses = keywords.map(() => `(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)`).join(" OR ");
  const params = keywords.flatMap((k) => [`%${k.toLowerCase()}%`, `%${k.toLowerCase()}%`]);
  // 7-day lookback window — older context rarely helps a live brief.
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT id, title, description, url, source_name, published_at, category
    FROM articles
    WHERE published_at > ? AND (${likeClauses})
    ORDER BY published_at DESC
    LIMIT ?
  `).all(cutoff, ...params, Math.min(limit * 3, 200));

  // Boost preferred sources, then trim.
  const prefSet = new Set(preferredSources.map((s) => s.toLowerCase()));
  rows.sort((a, b) => {
    const aPref = prefSet.has((a.source_name || "").toLowerCase()) ? 1 : 0;
    const bPref = prefSet.has((b.source_name || "").toLowerCase()) ? 1 : 0;
    if (aPref !== bPref) return bPref - aPref;
    return b.published_at - a.published_at;
  });
  return rows.slice(0, limit);
}

export function upsertLiveEvent(evt) {
  const db = getDb();
  db.prepare(`
    INSERT INTO live_events (id, title, subtitle, emoji, status, region, brief, metrics, summary, updated_at, ceasefire_at)
    VALUES (@id, @title, @subtitle, @emoji, @status, @region, @brief, @metrics, @summary, @updated_at, @ceasefire_at)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      subtitle = excluded.subtitle,
      emoji = excluded.emoji,
      status = excluded.status,
      region = excluded.region,
      brief = excluded.brief,
      metrics = excluded.metrics,
      summary = excluded.summary,
      updated_at = excluded.updated_at,
      ceasefire_at = excluded.ceasefire_at
  `).run({
    id: evt.id,
    title: evt.title,
    subtitle: evt.subtitle || null,
    emoji: evt.emoji || null,
    status: evt.status || "active",
    region: evt.region || null,
    brief: JSON.stringify(evt.brief || []),
    metrics: JSON.stringify(evt.metrics || {}),
    summary: evt.summary || null,
    updated_at: evt.updated_at || Date.now(),
    ceasefire_at: evt.ceasefire_at || null,
  });
}

function hydrateEvent(row) {
  if (!row) return null;
  let brief = [];
  let metrics = {};
  try { brief = JSON.parse(row.brief || "[]"); } catch {}
  try { metrics = JSON.parse(row.metrics || "{}"); } catch {}
  return { ...row, brief, metrics };
}

export function listLiveEvents() {
  const rows = getDb().prepare(`
    SELECT id, title, subtitle, emoji, status, region, summary, updated_at, ceasefire_at
    FROM live_events ORDER BY updated_at DESC
  `).all();
  return rows;
}

export function getLiveEvent(id) {
  const row = getDb().prepare(`SELECT * FROM live_events WHERE id = ?`).get(id);
  return hydrateEvent(row);
}

// ─── Push Subscriptions ──────────────────────────────────────────────────

export function upsertPushSubscription({ endpoint, p256dh, auth, topics, country, language, userAgent }) {
  const now = Date.now();
  const topicsJson = JSON.stringify(Array.isArray(topics) ? topics : []);
  getDb().prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, topics, country, language, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      topics = excluded.topics,
      country = excluded.country,
      language = excluded.language,
      user_agent = excluded.user_agent,
      disabled_at = NULL,
      failure_count = 0
  `).run(endpoint, p256dh, auth, topicsJson, country || null, language || "en", (userAgent || "").slice(0, 200), now);
}

export function deletePushSubscription(endpoint) {
  return getDb().prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint).changes;
}

export function listActivePushSubscriptions({ topic } = {}) {
  const rows = getDb().prepare(`
    SELECT id, endpoint, p256dh, auth, topics, country, language
    FROM push_subscriptions
    WHERE disabled_at IS NULL
  `).all();
  if (!topic) return rows;
  return rows.filter((r) => {
    try { const t = JSON.parse(r.topics || "[]"); return !t.length || t.includes(topic); }
    catch { return true; }
  });
}

export function markPushSent(endpoint, success) {
  const now = Date.now();
  if (success) {
    getDb().prepare(`UPDATE push_subscriptions SET last_sent_at = ?, failure_count = 0 WHERE endpoint = ?`).run(now, endpoint);
  } else {
    getDb().prepare(`UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE endpoint = ?`).run(endpoint);
  }
}

export function disablePushSubscription(endpoint) {
  getDb().prepare(`UPDATE push_subscriptions SET disabled_at = ? WHERE endpoint = ?`).run(Date.now(), endpoint);
}

export function pushSubscriptionStats() {
  return getDb().prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN disabled_at IS NULL THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN disabled_at IS NOT NULL THEN 1 ELSE 0 END) AS disabled
    FROM push_subscriptions
  `).get();
}

// ─── Push dedupe ─────────────────────────────────────────────────────────

export function hasArticleBeenPushed(articleId, topic = "*") {
  return Boolean(
    getDb().prepare(`SELECT 1 FROM pushed_articles WHERE article_id = ? AND topic = ?`).get(articleId, topic),
  );
}

export function recordArticlePush(articleId, topic, { sent = 0, failed = 0 } = {}) {
  getDb().prepare(`
    INSERT INTO pushed_articles (article_id, topic, pushed_at, sent, failed)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(article_id, topic) DO UPDATE SET
      pushed_at = excluded.pushed_at,
      sent = excluded.sent,
      failed = excluded.failed
  `).run(articleId, topic, Date.now(), sent, failed);
}

// ─── Social posting helpers ──────────────────────────────────────────────

export function hasArticleBeenPosted(articleId, platform) {
  return Boolean(
    getDb().prepare(`SELECT 1 FROM social_posts WHERE article_id = ? AND platform = ?`).get(articleId, platform),
  );
}

export function recordSocialPost({ articleId, platform, status = "posted", platformPostId = null, url = null, caption = null, error = null }) {
  getDb().prepare(`
    INSERT INTO social_posts (article_id, platform, status, platform_post_id, url, caption, error, posted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(article_id, platform) DO UPDATE SET
      status = excluded.status,
      platform_post_id = excluded.platform_post_id,
      url = excluded.url,
      caption = excluded.caption,
      error = excluded.error,
      posted_at = excluded.posted_at
  `).run(articleId, platform, status, platformPostId, url, caption, error, Date.now());
}

export function lastPostAt(platform) {
  const row = getDb().prepare(`SELECT MAX(posted_at) AS at FROM social_posts WHERE platform = ? AND status = 'posted'`).get(platform);
  return row?.at || 0;
}

export function findFreshUnpostedArticles({ platform, minCredibility = 7, withinMs = 12 * 60 * 60 * 1000, limit = 10 } = {}) {
  const cutoff = Date.now() - withinMs;
  return getDb().prepare(`
    SELECT a.id, a.title, a.description, a.category, a.source_name, a.published_at, a.credibility, a.url, a.image_url
    FROM articles a
    LEFT JOIN social_posts s ON s.article_id = a.id AND s.platform = ?
    WHERE s.article_id IS NULL
      AND a.published_at > ?
      AND a.credibility >= ?
    ORDER BY a.credibility DESC, a.published_at DESC
    LIMIT ?
  `).all(platform, cutoff, minCredibility, limit);
}

export function socialPostStats({ withinMs = 24 * 60 * 60 * 1000 } = {}) {
  const cutoff = Date.now() - withinMs;
  return getDb().prepare(`
    SELECT platform, status, COUNT(*) AS n
    FROM social_posts
    WHERE posted_at > ?
    GROUP BY platform, status
    ORDER BY platform
  `).all(cutoff);
}

// ─── Referral helpers ────────────────────────────────────────────────────────

// How many verified, non-unsubscribed subscribers did token refer?
export function getReferralCount(referrerToken) {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS n FROM subscribers
    WHERE referred_by_token = ?
      AND verified_at IS NOT NULL
      AND unsubscribed_at IS NULL
  `).get(referrerToken);
  return row?.n || 0;
}

// Top 20 referrers — used for leaderboard in weekly digest.
export function getReferralLeaderboard(limit = 20) {
  return getDb().prepare(`
    SELECT referred_by_token AS token, COUNT(*) AS referrals
    FROM subscribers
    WHERE referred_by_token IS NOT NULL
      AND verified_at IS NOT NULL
      AND unsubscribed_at IS NULL
    GROUP BY referred_by_token
    ORDER BY referrals DESC
    LIMIT ?
  `).all(limit);
}

// ─── Tip helpers ────────────────────────────────────────────────────────────

export function createTipRecord({ id, amountCents, currency = "usd", email = null }) {
  getDb().prepare(`
    INSERT OR IGNORE INTO tips (id, amount_cents, currency, email, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(id, amountCents, currency, email, Date.now());
}

export function completeTip(sessionId, { stripePaymentIntent, email } = {}) {
  getDb().prepare(`
    UPDATE tips SET status = 'completed', stripe_pi = ?, email = COALESCE(?, email)
    WHERE id = ?
  `).run(stripePaymentIntent || null, email || null, sessionId);
}

export function getTipStats() {
  const db = getDb();
  return db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(amount_cents), 0) AS total_cents,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_cents ELSE 0 END), 0) AS completed_cents,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count
    FROM tips
  `).get();
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export function createAuthToken(token, email, expiresAt) {
  getDb().prepare(`
    INSERT OR REPLACE INTO auth_tokens (token, email, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, email.toLowerCase(), Date.now(), expiresAt);
}

export function consumeAuthToken(token) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM auth_tokens WHERE token = ? AND used_at IS NULL`).get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) return null;
  db.prepare(`UPDATE auth_tokens SET used_at = ? WHERE token = ?`).run(Date.now(), token);
  return row; // { token, email, created_at, expires_at }
}

// Find or create a user by email. Returns the user row.
export function upsertUser({ id, email, language, preferredTopics, preferredCountry, subscriberToken }) {
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase());
  if (existing) {
    db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(Date.now(), existing.id);
    return existing;
  }
  db.prepare(`
    INSERT INTO users (id, email, created_at, last_login_at, preferred_topics, preferred_country, language, subscriber_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    email.toLowerCase(),
    Date.now(),
    Date.now(),
    JSON.stringify(Array.isArray(preferredTopics) ? preferredTopics : []),
    preferredCountry || null,
    language || "en",
    subscriberToken || null,
  );
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

export function getUserById(userId) {
  return getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
}

export function createUserSession(sessionId, userId, expiresAt) {
  getDb().prepare(`
    INSERT INTO user_sessions (id, user_id, created_at, expires_at, last_seen)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, Date.now(), expiresAt, Date.now());
}

export function getUserBySession(sessionId) {
  const db = getDb();
  const session = db.prepare(`
    SELECT * FROM user_sessions WHERE id = ? AND expires_at > ?
  `).get(sessionId, Date.now());
  if (!session) return null;
  db.prepare(`UPDATE user_sessions SET last_seen = ? WHERE id = ?`).run(Date.now(), sessionId);
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(session.user_id);
}

export function deleteUserSession(sessionId) {
  getDb().prepare(`DELETE FROM user_sessions WHERE id = ?`).run(sessionId);
}

export function updateUserPrefs(userId, { preferredTopics, language, preferredCountry }) {
  const db = getDb();
  if (preferredTopics !== undefined) {
    db.prepare(`UPDATE users SET preferred_topics = ? WHERE id = ?`)
      .run(JSON.stringify(Array.isArray(preferredTopics) ? preferredTopics : []), userId);
  }
  if (language !== undefined) {
    db.prepare(`UPDATE users SET language = ? WHERE id = ?`).run(language, userId);
  }
  if (preferredCountry !== undefined) {
    db.prepare(`UPDATE users SET preferred_country = ? WHERE id = ?`).run(preferredCountry || null, userId);
  }
}

// ─── Saved articles (cross-device, server-side) ───────────────────────────
// Separate from localStorage saves — synced to server when user is logged in.
export function ensureSavedArticlesTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS saved_articles (
      user_id     TEXT NOT NULL,
      article_id  TEXT NOT NULL,
      saved_at    INTEGER NOT NULL,
      PRIMARY KEY (user_id, article_id)
    );
    CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_articles(user_id, saved_at DESC);
  `);
}

export function saveArticleForUser(userId, articleId) {
  ensureSavedArticlesTable();
  getDb().prepare(`
    INSERT OR IGNORE INTO saved_articles (user_id, article_id, saved_at)
    VALUES (?, ?, ?)
  `).run(userId, articleId, Date.now());
}

export function unsaveArticleForUser(userId, articleId) {
  ensureSavedArticlesTable();
  getDb().prepare(`DELETE FROM saved_articles WHERE user_id = ? AND article_id = ?`).run(userId, articleId);
}

export function getSavedArticlesForUser(userId, limit = 50) {
  ensureSavedArticlesTable();
  return getDb().prepare(`
    SELECT a.* FROM articles a
    JOIN saved_articles s ON s.article_id = a.id
    WHERE s.user_id = ?
    ORDER BY s.saved_at DESC
    LIMIT ?
  `).all(userId, limit);
}

// Pick fresh, high-credibility articles that haven't been pushed yet, ordered
// by recency. Used by the breaking-news worker.
export function findFreshUnpushedArticles({ minCredibility = 8, withinMs = 30 * 60 * 1000, limit = 5 } = {}) {
  const cutoff = Date.now() - withinMs;
  return getDb().prepare(`
    SELECT a.id, a.title, a.description, a.category, a.source_name, a.published_at, a.credibility, a.url
    FROM articles a
    LEFT JOIN pushed_articles p ON p.article_id = a.id AND p.topic = '*'
    WHERE p.article_id IS NULL
      AND a.published_at > ?
      AND a.credibility >= ?
    ORDER BY a.credibility DESC, a.published_at DESC
    LIMIT ?
  `).all(cutoff, minCredibility, limit);
}
