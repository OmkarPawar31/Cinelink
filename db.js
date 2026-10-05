// CineLink DB — node:sqlite backed, file-persisted, zero native deps.
// Tables per spec §22 with relationships + indexes.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'cinelink.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  banner_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  role TEXT DEFAULT 'user',
  is_banned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_settings(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  favorite_genres TEXT DEFAULT '[]',
  favorite_movies TEXT DEFAULT '[]',
  favorite_series TEXT DEFAULT '[]',
  platforms TEXT DEFAULT '[]',
  social_links TEXT DEFAULT '{}',
  profile_visibility TEXT DEFAULT 'public',
  activity_visibility TEXT DEFAULT 'everyone',
  who_can_message TEXT DEFAULT 'connections',
  who_can_request TEXT DEFAULT 'everyone',
  public_sections TEXT DEFAULT '{"overview":1,"watchlist":1,"watched":1,"reviews":1,"gallery":1,"activity":1,"connections":1}'
);
CREATE TABLE IF NOT EXISTS titles(
  key TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  year TEXT DEFAULT '',
  payload TEXT DEFAULT '{}',
  accent_color TEXT DEFAULT '#E5093B',
  fetched_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_titles_type_id ON titles(type, tmdb_id);
CREATE TABLE IF NOT EXISTS watchlists(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover TEXT DEFAULT '',
  visibility TEXT DEFAULT 'public',
  likes_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, slug)
);
CREATE TABLE IF NOT EXISTS watchlist_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  tmdb_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  poster TEXT DEFAULT '',
  note TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  added_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wlitem_list ON watchlist_items(watchlist_id, sort_order);
CREATE TABLE IF NOT EXISTS personal_list(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  poster TEXT DEFAULT '',
  category TEXT DEFAULT 'want',
  note TEXT DEFAULT '',
  rating REAL DEFAULT 0,
  position INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, tmdb_type, tmdb_id)
);
CREATE TABLE IF NOT EXISTS watched_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  season INTEGER DEFAULT NULL,
  episode INTEGER DEFAULT NULL,
  watched_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, tmdb_type, tmdb_id, season, episode)
);
CREATE TABLE IF NOT EXISTS favorites(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, tmdb_type, tmdb_id)
);
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  rating REAL NOT NULL,
  text TEXT DEFAULT '',
  spoiler INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_title ON reviews(tmdb_type, tmdb_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS likes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, target_type, target_id)
);
CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at);
CREATE TABLE IF NOT EXISTS gallery_posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_type TEXT DEFAULT '',
  tmdb_id INTEGER DEFAULT 0,
  title_name TEXT DEFAULT '',
  image_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  moment TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  likes_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gallery_title ON gallery_posts(tmdb_type, tmdb_id, likes_count DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_user ON gallery_posts(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS connections(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_conn_user ON connections(addressee_id, status);
CREATE TABLE IF NOT EXISTS conversations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user1_id, user2_id)
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT DEFAULT '',
  kind TEXT DEFAULT 'text',
  ref_data TEXT DEFAULT '{}',
  read_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS typing(
  conversation_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  ref TEXT DEFAULT '{}',
  read_flag INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_flag, id DESC);
CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS activity(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  ref_type TEXT DEFAULT '',
  ref_id TEXT DEFAULT '',
  visibility TEXT DEFAULT 'everyone',
  likes_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(created_at DESC);
`);

function row(q, ...p) { return db.prepare(q).get(...p); }
function all(q, ...p) { return db.prepare(q).all(...p); }
function run(q, ...p) { return db.prepare(q).run(...p); }

module.exports = { db, row, all, run, DATA_DIR, UPLOAD_DIR };
