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
      tags        TEXT DEFAULT '[]'
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
  `);
}

// ─── Article Operations ────────────────────────────────────────────────────

export function upsertArticle(article) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO articles
      (id, title, description, content, url, image_url, source_name,
       category, region, author, published_at, fetched_at, credibility, tags)
    VALUES
      (@id, @title, @description, @content, @url, @image_url, @source_name,
       @category, @region, @author, @published_at, @fetched_at, @credibility, @tags)
  `).run(article);
}

export function getArticles({ category, limit = 50, offset = 0, search = null, minCredibility = 0, source = null }) {
  const db = getDb();
  let query = `SELECT * FROM articles WHERE credibility >= ?`;
  const params = [minCredibility];
  if (category && category !== "top") { query += ` AND category = ?`; params.push(category); }
  if (source) { query += ` AND source_name = ?`; params.push(source); }
  if (search) { query += ` AND (title LIKE ? OR description LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }

  // For the mixed "top" feed (no category filter), bucket into 3-hour windows then
  // prioritise by editorial weight so politics/international rise above sports/cars.
  // Single-category views use plain recency (all articles share the same priority).
  const isMixedFeed = !category || category === "top";
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
