// CineLink backend — Express + node:sqlite + JWT + TMDB proxy (key stays server-side).
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { row, all, run, UPLOAD_DIR } = require('./db');

const PORT = process.env.PORT || 3100;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE = (process.env.TMDB_BASE || 'https://api.themoviedb.org/3').replace(/\/$/, '');
const IMG = (process.env.TMDB_IMAGE_BASE || 'https://image.tmdb.org/t/p').replace(/\/$/, '');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- uploads ----------
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 5) || '.jpg';
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

// ---------- helpers ----------
const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'list';
const sign = (u) => jwt.sign({ id: u.id, username: u.username, role: u.role }, JWT_SECRET, { expiresIn: '30d' });
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'auth required' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'session expired' }); }
}
const optionalAuth = (req, _res, next) => {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (t) { try { req.user = jwt.verify(t, JWT_SECRET); } catch {} }
  next();
};
const pub = (u) => u && ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, banner_url: u.banner_url, bio: u.bio, created_at: u.created_at });
function notify(user_id, type, text, ref = {}) {
  try { run('INSERT INTO notifications(user_id,type,text,ref) VALUES(?,?,?,?)', user_id, type, text, JSON.stringify(ref)); } catch {}
}
function logActivity(user_id, kind, text, ref_type = '', ref_id = '', visibility = 'everyone') {
  try { run('INSERT INTO activity(user_id,kind,text,ref_type,ref_id,visibility) VALUES(?,?,?,?,?,?)', user_id, kind, text, ref_type, ref_id, visibility); } catch {}
}
// Per-title accent: deterministic vibrant pick (swap with node-vibrant for true poster extraction).
// TODO: replace with node-vibrant on the w92 poster for exact dominant-color extraction.
function accentFor(type, id, genres = []) {
  const palettes = ['#E5093B', '#35C8FF', '#B45AFF', '#FFB13B', '#3BFF9E', '#FF5A5A', '#4AE3D4', '#FF7AD9'];
  let h = 0; const s = `${type}:${id}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  if (/horror/i.test(genres.join(' '))) return '#FF5A3B';
  if (/science|fantasy/i.test(genres.join(' '))) return '#35C8FF';
  if (/romance|drama/i.test(genres.join(' '))) return '#FF7AD9';
  return palettes[h % palettes.length];
}
function particleMood(genres = []) {
  const g = genres.join(' ').toLowerCase();
  if (/horror|mystery|thriller/.test(g)) return 'ash';
  if (/action|war|crime|western/.test(g)) return 'embers';
  if (/romance|drama|family/.test(g)) return 'bokeh';
  if (/animation|comedy|music/.test(g)) return 'sparkle';
  if (/sci|fantasy|adventure/.test(g)) return 'sparks';
  return 'dust';
}

// ---------- DEMO fallback (works with no TMDB key / offline) ----------
function demoTitle(type, id) {
  const isTV = type === 'tv';
  const base = {
    id: Number(id) || 1, media_type: type,
    title: isTV ? 'Breaking Bad' : 'Interstellar',
    name: isTV ? 'Breaking Bad' : undefined,
    original_title: isTV ? 'Breaking Bad' : 'Interstellar',
    overview: isTV
      ? 'A high-school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing methamphetamine to secure his family\'s future.'
      : 'With Earth becoming uninhabitable, a team of explorers travels through a wormhole in space in an attempt to ensure humanity\'s survival.',
    tagline: isTV ? 'All hail the king.' : 'Mankind was born on Earth. It was never meant to die here.',
    release_date: isTV ? '2008-01-20' : '2014-11-07', first_air_date: isTV ? '2008-01-20' : undefined,
    runtime: isTV ? undefined : 169, number_of_seasons: isTV ? 5 : undefined, number_of_episodes: isTV ? 62 : undefined,
    vote_average: 8.9, vote_count: 24000,
    genres: isTV ? [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }] : [{ id: 878, name: 'Sci-Fi' }, { id: 18, name: 'Drama' }],
    poster_path: null, backdrop_path: null,
    credits: { cast: ['Bryan Cranston', 'Aaron Paul', 'Anna Gunn', 'Bob Odenkirk', 'Giancarlo Esposito', 'Jonathan Banks'].map((n, i) => ({ id: 1000 + i, name: n, character: ['Walter White', 'Jesse Pinkman', 'Skyler White', 'Saul Goodman', 'Gus Fring', 'Mike Ehrmantraut'][i], profile_path: null, order: i })) },
    images: { backdrops: [], logos: [], posters: [] },
    videos: { results: [] },
    'watch/providers': { results: {} },
    similar: { results: [] }
  };
  return base;
}

// ---------- TMDB proxy with 24h cache ----------
async function tmdb(pathname, params = {}) {
  if (!TMDB_KEY) throw new Error('no-key');
  const u = new URL(TMDB_BASE + pathname);
  u.searchParams.set('api_key', TMDB_KEY);
  u.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error('tmdb ' + r.status);
  return r.json();
}
async function getTitle(type, id) {
  const key = `${type}_${id}`;
  const cached = row('SELECT * FROM titles WHERE key=?', key);
  if (cached) {
    const ageH = (Date.now() - new Date(cached.fetched_at.replace(' ', 'T') + 'Z').getTime()) / 36e5;
    if (ageH < 24) return { ...JSON.parse(cached.payload), _accent: cached.accent_color, _cached: true };
  }
  let data;
  if (!TMDB_KEY) {
    data = demoTitle(type, id);
  } else {
    try {
      const app = type === 'tv'
        ? 'append_to_response=aggregate_credits,credits,images,videos,watch/providers,similar,content_ratings'
        : 'append_to_response=credits,images,videos,watch/providers,similar,release_dates';
      data = await tmdb(`/${type}/${id}`, {});
      // fetch appended in one go via raw (append_to_response as query)
      const u = new URL(`${TMDB_BASE}/${type}/${id}`); u.searchParams.set('api_key', TMDB_KEY); u.searchParams.set('language', 'en-US');
      u.searchParams.set('append_to_response', type === 'tv' ? 'aggregate_credits,credits,images,videos,watch/providers,similar,content_ratings' : 'credits,images,videos,watch/providers,similar,release_dates');
      const r = await fetch(u.toString()); if (!r.ok) throw new Error('tmdb detail');
      data = await r.json();
    } catch (e) { if (cached) return { ...JSON.parse(cached.payload), _accent: cached.accent_color, _cached: true }; data = demoTitle(type, id); }
  }
  const genres = (data.genres || []).map(g => g.name);
  const accent = accentFor(type, id, genres);
  const title = data.title || data.name || 'Untitled';
  const year = (data.release_date || data.first_air_date || '').slice(0, 4);
  run('INSERT INTO titles(key,type,tmdb_id,title,year,payload,accent_color,fetched_at) VALUES(?,?,?,?,?,?,?,datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, accent_color=excluded.accent_color, fetched_at=datetime(\'now\')',
    key, type, Number(id), title, year, JSON.stringify(data), accent);
  return { ...data, _accent: accent, _mood: particleMood(genres), _cached: false };
}

// ================= AUTH =================
app.post('/api/auth/signup', upload.single('avatar'), async (req, res) => {
  try {
    const { username, display_name, email, password } = req.body;
    if (!username || !email || !password || !display_name) return res.status(400).json({ error: 'all fields required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'password min 6 chars' });
    if (row('SELECT id FROM users WHERE username=?', username) || row('SELECT id FROM users WHERE email=?', email))
      return res.status(409).json({ error: 'username or email taken' });
    const hash = await bcrypt.hash(password, 10);
    const avatar = req.file ? '/uploads/' + req.file.filename : '';
    const r = run('INSERT INTO users(username,display_name,email,password_hash,avatar_url) VALUES(?,?,?,?,?)', username.trim(), display_name.trim(), email.trim().toLowerCase(), hash, avatar);
    run('INSERT INTO user_settings(user_id) VALUES(?)', r.lastInsertRowid);
    // every user gets a default personal watchlist container via personal_list rows (lazy) + one public list
    run('INSERT INTO watchlists(user_id,name,slug,description,visibility) VALUES(?,?,?,?,?)', r.lastInsertRowid, 'My Watchlist', 'my-watchlist', 'Everything I want to watch.', 'private');
    const u = row('SELECT * FROM users WHERE id=?', r.lastInsertRowid);
    logActivity(u.id, 'join', `${u.display_name} joined CineLink.`, 'user', String(u.id));
    res.json({ token: sign(u), user: pub(u) });
  } catch (e) { res.status(500).json({ error: 'signup failed' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const u = row('SELECT * FROM users WHERE email=? COLLATE NOCASE', String(email || '').toLowerCase());
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) return res.status(401).json({ error: 'invalid credentials' });
  if (u.is_banned) return res.status(403).json({ error: 'account suspended' });
  res.json({ token: sign(u), user: pub(u) });
});
app.post('/api/auth/forgot', (req, res) => {
  const u = row('SELECT id FROM users WHERE email=? COLLATE NOCASE', String(req.body.email || '').toLowerCase());
  if (!u) return res.json({ ok: true }); // don't leak
  const token = jwt.sign({ id: u.id, purpose: 'reset' }, JWT_SECRET, { expiresIn: '30m' });
  console.log('[reset-link] user', u.id, 'token', token); // MVP: logged; wire email provider here
  res.json({ ok: true, resetToken: token }); // returned for demo so flows are testable without SMTP
});
app.post('/api/auth/reset', async (req, res) => {
  try {
    const { token, password } = req.body;
    const p = jwt.verify(token, JWT_SECRET);
    if (p.purpose !== 'reset') throw 0;
    const hash = await bcrypt.hash(password, 10);
    run('UPDATE users SET password_hash=? WHERE id=?', hash, p.id);
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'invalid or expired token' }); }
});
app.get('/api/auth/google', (req, res) => {
  // Stub: full OAuth needs GOOGLE_CLIENT_ID + redirect. Kept honest — disabled unless configured.
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ error: 'Google login not configured on this server' });
  res.json({ ok: false });
});
app.get('/api/auth/me', auth, (req, res) => {
  const u = row('SELECT * FROM users WHERE id=?', req.user.id);
  const s = row('SELECT * FROM user_settings WHERE user_id=?', req.user.id);
  res.json({ user: pub(u), settings: s ? { ...s, favorite_genres: JSON.parse(s.favorite_genres || '[]'), favorite_movies: JSON.parse(s.favorite_movies || '[]'), favorite_series: JSON.parse(s.favorite_series || '[]'), platforms: JSON.parse(s.platforms || '[]'), social_links: JSON.parse(s.social_links || '{}'), public_sections: JSON.parse(s.public_sections || '{}') } : null });
});
app.put('/api/profile', auth, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), (req, res) => {
  const b = req.body || {};
  const cur = row('SELECT * FROM users WHERE id=?', req.user.id);
  const avatar = req.files?.avatar?.[0] ? '/uploads/' + req.files.avatar[0].filename : cur.avatar_url;
  const banner = req.files?.banner?.[0] ? '/uploads/' + req.files.banner[0].filename : cur.banner_url;
  if (b.username && b.username !== cur.username && row('SELECT id FROM users WHERE username=? AND id<>?', b.username, req.user.id))
    return res.status(409).json({ error: 'username taken' });
  run('UPDATE users SET username=?, display_name=?, bio=?, avatar_url=?, banner_url=? WHERE id=?',
    b.username || cur.username, b.display_name || cur.display_name, b.bio ?? cur.bio, avatar, banner, req.user.id);
  run(`UPDATE user_settings SET favorite_genres=?, favorite_movies=?, favorite_series=?, platforms=?, social_links=?,
    profile_visibility=?, activity_visibility=?, who_can_message=?, who_can_request=?, public_sections=? WHERE user_id=?`,
    b.favorite_genres || '[]', b.favorite_movies || '[]', b.favorite_series || '[]', b.platforms || '[]', b.social_links || '{}',
    b.profile_visibility || 'public', b.activity_visibility || 'everyone', b.who_can_message || 'connections', b.who_can_request || 'everyone',
    b.public_sections || '{"overview":1}', req.user.id);
  res.json({ ok: true });
});
app.delete('/api/account', auth, (req, res) => {
  run('DELETE FROM users WHERE id=?', req.user.id);
  res.json({ ok: true });
});

// ================= DISCOVER / TMDB =================
app.get('/api/discover/:kind', optionalAuth, async (req, res) => {
  const kind = req.params.kind; // trending-movies | trending-series | popular-week | recent
  try {
    if (!TMDB_KEY) {
      const demo = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: 100 + i, media_type: kind.includes('series') ? 'tv' : 'movie', title: `Demo Title ${i}`, name: `Demo Series ${i}`, poster_path: null, backdrop_path: null, release_date: '2023-01-01', first_air_date: '2023-01-01', vote_average: 7 + (i % 3) * 0.5, genre_ids: [18, 878] }));
      return res.json({ results: demo, demo: true });
    }
    let path = '/trending/movie/week', extra = {};
    if (kind === 'trending-series') path = '/trending/tv/week';
    if (kind === 'popular-week') path = '/trending/all/week';
    if (kind === 'recent') { path = '/movie/now_playing'; }
    const d = await tmdb(path, extra);
    res.json(d);
  } catch (e) { res.status(502).json({ error: 'discover unavailable', demo: true, results: [] }); }
});
app.get('/api/search', optionalAuth, async (req, res) => {
  const { q, type = 'multi', genre, year, rating } = req.query;
  if (!q && !genre) return res.json({ results: [] });
  try {
    if (!TMDB_KEY) return res.json({ results: [], demo: true, note: 'set TMDB_API_KEY for live search' });
    let d;
    if (type === 'user') {
      const rows = all('SELECT id,username,display_name,avatar_url,bio FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 12', `%${q}%`, `%${q}%`);
      return res.json({ results: rows.map(r => ({ ...r, media_type: 'user' })) });
    }
    d = await tmdb('/search/' + (type === 'multi' ? 'multi' : type === 'tv' ? 'tv' : 'movie'), { query: q || '', year: year || '', first_air_date_year: year || '' });
    let results = d.results || [];
    if (rating) results = results.filter(r => (r.vote_average || 0) >= Number(rating));
    res.json({ ...d, results });
  } catch (e) { res.status(502).json({ error: 'search failed' }); }
});
app.get('/api/title/:type/:id', optionalAuth, async (req, res) => {
  try {
    const data = await getTitle(req.params.type, req.params.id);
    res.json({ ...data, _img: IMG, _attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.' });
  } catch (e) { res.status(502).json({ error: 'title unavailable' }); }
});
app.get('/api/title/:type/:id/season/:n', optionalAuth, async (req, res) => {
  try {
    if (!TMDB_KEY) return res.json({ episodes: [1, 2, 3].map(i => ({ episode_number: i, name: `Episode ${i}`, overview: 'Demo synopsis. Set TMDB_API_KEY for real episode stills.', still_path: null, air_date: '2023-01-01', runtime: 45 })), demo: true });
    const d = await tmdb(`/tv/${req.params.id}/season/${req.params.n}`);
    res.json(d);
  } catch { res.status(502).json({ error: 'season unavailable' }); }
});
app.get('/api/person/:id', optionalAuth, async (req, res) => {
  try {
    if (!TMDB_KEY) return res.json({ biography: 'Demo biography. Set TMDB_API_KEY for the real bio.', demo: true });
    res.json(await tmdb(`/person/${req.params.id}`));
  } catch { res.status(502).json({ error: 'person unavailable' }); }
});

// ================= PERSONAL LIST / WATCHED / FAVORITES =================
app.get('/api/mylist', auth, (req, res) => {
  res.json({ items: all('SELECT * FROM personal_list WHERE user_id=? ORDER BY position, updated_at DESC', req.user.id) });
});
app.post('/api/mylist', auth, (req, res) => {
  const { tmdb_type, tmdb_id, title, poster, category = 'want', note = '' } = req.body;
  const pos = row('SELECT COUNT(*) c FROM personal_list WHERE user_id=?', req.user.id).c;
  run(`INSERT INTO personal_list(user_id,tmdb_type,tmdb_id,title,poster,category,note,position,updated_at)
    VALUES(?,?,?,?,?,?,?, ?,datetime('now')) ON CONFLICT(user_id,tmdb_type,tmdb_id) DO UPDATE SET category=excluded.category, note=excluded.note, title=excluded.title, poster=excluded.poster, updated_at=datetime('now')`,
    req.user.id, tmdb_type, tmdb_id, title || '', poster || '', category, note, pos);
  logActivity(req.user.id, 'watchlist-add', `added ${title} to ${category}.`, tmdb_type, `${tmdb_type}:${tmdb_id}`);
  res.json({ ok: true });
});
app.put('/api/mylist/reorder', auth, (req, res) => {
  const { order } = req.body; // [ids]
  (order || []).forEach((id, i) => run('UPDATE personal_list SET position=? WHERE id=? AND user_id=?', i, id, req.user.id));
  res.json({ ok: true });
});
app.delete('/api/mylist/:type/:id', auth, (req, res) => {
  run('DELETE FROM personal_list WHERE user_id=? AND tmdb_type=? AND tmdb_id=?', req.user.id, req.params.type, req.params.id);
  res.json({ ok: true });
});
app.get('/api/stats', auth, (req, res) => {
  const items = all('SELECT * FROM personal_list WHERE user_id=?', req.user.id);
  const watched = all('SELECT * FROM watched_items WHERE user_id=?', req.user.id);
  res.json({
    totalMovies: watched.filter(w => w.tmdb_type === 'movie' && !w.episode).length,
    totalSeries: new Set(watched.filter(w => w.tmdb_type === 'tv').map(w => w.tmdb_id)).size,
    watching: items.filter(i => i.category === 'watching').length,
    watchlistCount: items.filter(i => i.category === 'want').length,
    favorites: row('SELECT COUNT(*) c FROM favorites WHERE user_id=?', req.user.id).c,
    recent: items.slice(0, 6)
  });
});
app.post('/api/watched', auth, (req, res) => {
  const { tmdb_type, tmdb_id, season = null, episode = null, title = '' } = req.body;
  run('INSERT OR IGNORE INTO watched_items(user_id,tmdb_type,tmdb_id,season,episode) VALUES(?,?,?,?,?)', req.user.id, tmdb_type, tmdb_id, season, episode);
  logActivity(req.user.id, 'watched', `watched ${title || tmdb_type + ' ' + tmdb_id}${episode ? ` S${season}E${episode}` : ''}.`, tmdb_type, `${tmdb_type}:${tmdb_id}`);
  res.json({ ok: true });
});
app.get('/api/watched/:type/:id', auth, (req, res) => {
  res.json({ items: all('SELECT * FROM watched_items WHERE user_id=? AND tmdb_type=? AND tmdb_id=?', req.user.id, req.params.type, req.params.id) });
});
app.post('/api/favorite', auth, (req, res) => {
  const { tmdb_type, tmdb_id, title = '' } = req.body;
  const has = row('SELECT 1 FROM favorites WHERE user_id=? AND tmdb_type=? AND tmdb_id=?', req.user.id, tmdb_type, tmdb_id);
  if (has) run('DELETE FROM favorites WHERE user_id=? AND tmdb_type=? AND tmdb_id=?', req.user.id, tmdb_type, tmdb_id);
  else { run('INSERT INTO favorites(user_id,tmdb_type,tmdb_id) VALUES(?,?,?)', req.user.id, tmdb_type, tmdb_id); logActivity(req.user.id, 'favorite', `added ${title} to favorites.`, tmdb_type, `${tmdb_type}:${tmdb_id}`); }
  res.json({ favorited: !has });
});
app.post('/api/rate', auth, (req, res) => {
  const { tmdb_type, tmdb_id, value } = req.body;
  run(`INSERT INTO personal_list(user_id,tmdb_type,tmdb_id,category,rating,updated_at) VALUES(?,?,?,'watched',?,datetime('now'))
    ON CONFLICT(user_id,tmdb_type,tmdb_id) DO UPDATE SET rating=excluded.rating, updated_at=datetime('now')`, req.user.id, tmdb_type, tmdb_id, Math.min(5, Math.max(0.5, Number(value))));
  res.json({ ok: true });
});

// ================= CUSTOM WATCHLISTS =================
app.get('/api/watchlists', optionalAuth, (req, res) => {
  const mine = req.user ? all('SELECT w.*, u.username FROM watchlists w JOIN users u ON u.id=w.user_id WHERE w.user_id=? ORDER BY w.id DESC', req.user.id) : [];
  const popular = all(`SELECT w.*, u.username FROM watchlists w JOIN users u ON u.id=w.user_id WHERE w.visibility='public' ORDER BY w.likes_count DESC LIMIT 12`);
  res.json({ mine, popular });
});
app.post('/api/watchlists', auth, upload.single('cover'), (req, res) => {
  const { name, description = '', visibility = 'public' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  let slug = slugify(name), base = slug, i = 2;
  while (row('SELECT id FROM watchlists WHERE user_id=? AND slug=?', req.user.id, slug)) slug = `${base}-${i++}`;
  const cover = req.file ? '/uploads/' + req.file.filename : '';
  const r = run('INSERT INTO watchlists(user_id,name,slug,description,cover,visibility) VALUES(?,?,?,?,?,?)', req.user.id, name, slug, description, cover, visibility);
  const me = row('SELECT username FROM users WHERE id=?', req.user.id);
  logActivity(req.user.id, 'watchlist-create', `created watchlist: ${name}.`, 'watchlist', String(r.lastInsertRowid));
  res.json({ id: r.lastInsertRowid, slug, url: `/@${me.username}/${slug}` });
});
app.get('/api/w/:username/:slug', optionalAuth, (req, res) => {
  const owner = row('SELECT * FROM users WHERE username=? COLLATE NOCASE', req.params.username);
  if (!owner) return res.status(404).json({ error: 'not found' });
  const w = row('SELECT * FROM watchlists WHERE user_id=? AND slug=?', owner.id, req.params.slug);
  if (!w) return res.status(404).json({ error: 'not found' });
  if (w.visibility === 'private' && req.user?.id !== owner.id) return res.status(403).json({ error: 'private' });
  res.json({ list: w, owner: pub(owner), items: all('SELECT * FROM watchlist_items WHERE watchlist_id=? ORDER BY sort_order', w.id) });
});
app.post('/api/watchlists/:id/items', auth, (req, res) => {
  const w = row('SELECT * FROM watchlists WHERE id=?', req.params.id);
  if (!w || w.user_id !== req.user.id) return res.status(403).json({ error: 'not yours' });
  const { tmdb_type, tmdb_id, title, poster } = req.body;
  const n = row('SELECT COUNT(*) c FROM watchlist_items WHERE watchlist_id=?', w.id).c;
  run('INSERT INTO watchlist_items(watchlist_id,tmdb_type,tmdb_id,title,poster,sort_order) VALUES(?,?,?,?,?,?)', w.id, tmdb_type, tmdb_id, title || '', poster || '', n);
  res.json({ ok: true });
});
app.delete('/api/watchlists/:id', auth, (req, res) => {
  run('DELETE FROM watchlists WHERE id=? AND user_id=?', req.params.id, req.user.id);
  res.json({ ok: true });
});

// ================= REVIEWS / LIKES / COMMENTS =================
app.get('/api/reviews', optionalAuth, (req, res) => {
  const { type, id, user, latest } = req.query;
  let q = 'SELECT r.*, u.username, u.display_name, u.avatar_url FROM reviews r JOIN users u ON u.id=r.user_id';
  const p = [];
  if (type && id) { q += ' WHERE r.tmdb_type=? AND r.tmdb_id=?'; p.push(type, id); }
  else if (user) { q += ' WHERE r.user_id=?'; p.push(user); }
  q += ' ORDER BY r.id DESC LIMIT 40';
  res.json({ reviews: all(q, ...p) });
});
app.post('/api/reviews', auth, (req, res) => {
  const { tmdb_type, tmdb_id, title = '', rating, text = '', spoiler = 0 } = req.body;
  if (!rating || rating < 0.5 || rating > 5) return res.status(400).json({ error: 'rating 0.5–5 required' });
  const r = run('INSERT INTO reviews(user_id,tmdb_type,tmdb_id,title,rating,text,spoiler) VALUES(?,?,?,?,?,?,?)', req.user.id, tmdb_type, tmdb_id, title, rating, text, spoiler ? 1 : 0);
  logActivity(req.user.id, 'review', `reviewed ${title} — ${rating}★.`, 'review', String(r.lastInsertRowid));
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/reviews/:id', auth, (req, res) => {
  const r = row('SELECT * FROM reviews WHERE id=?', req.params.id);
  if (!r || (r.user_id !== req.user.id && req.user.role !== 'admin')) return res.status(403).json({ error: 'forbidden' });
  run('UPDATE reviews SET rating=?, text=?, spoiler=? WHERE id=?', req.body.rating ?? r.rating, req.body.text ?? r.text, req.body.spoiler ? 1 : 0, r.id);
  res.json({ ok: true });
});
app.delete('/api/reviews/:id', auth, (req, res) => {
  const r = row('SELECT * FROM reviews WHERE id=?', req.params.id);
  if (!r || (r.user_id !== req.user.id && req.user.role !== 'admin')) return res.status(403).json({ error: 'forbidden' });
  run('DELETE FROM reviews WHERE id=?', r.id);
  res.json({ ok: true });
});
function toggleLike(user_id, target_type, target_id) {
  const has = row('SELECT id FROM likes WHERE user_id=? AND target_type=? AND target_id=?', user_id, target_type, target_id);
  if (has) {
    run('DELETE FROM likes WHERE id=?', has.id);
    if (target_type === 'review') run('UPDATE reviews SET likes_count=likes_count-1 WHERE id=?', target_id);
    if (target_type === 'watchlist') run('UPDATE watchlists SET likes_count=likes_count-1 WHERE id=?', target_id);
    if (target_type === 'gallery') run('UPDATE gallery_posts SET likes_count=likes_count-1 WHERE id=?', target_id);
    if (target_type === 'activity') run('UPDATE activity SET likes_count=likes_count-1 WHERE id=?', target_id);
    return false;
  }
  run('INSERT INTO likes(user_id,target_type,target_id) VALUES(?,?,?)', user_id, target_type, target_id);
  if (target_type === 'review') run('UPDATE reviews SET likes_count=likes_count+1 WHERE id=?', target_id);
  if (target_type === 'watchlist') run('UPDATE watchlists SET likes_count=likes_count+1 WHERE id=?', target_id);
  if (target_type === 'gallery') run('UPDATE gallery_posts SET likes_count=likes_count+1 WHERE id=?', target_id);
  if (target_type === 'activity') run('UPDATE activity SET likes_count=likes_count+1 WHERE id=?', target_id);
  return true;
}
app.post('/api/like', auth, (req, res) => {
  const { target_type, target_id } = req.body;
  const liked = toggleLike(req.user.id, target_type, String(target_id));
  // notify owners (best-effort)
  try {
    let owner = null;
    if (target_type === 'review') owner = row('SELECT user_id FROM reviews WHERE id=?', target_id)?.user_id;
    if (target_type === 'gallery') owner = row('SELECT user_id FROM gallery_posts WHERE id=?', target_id)?.user_id;
    if (target_type === 'watchlist') owner = row('SELECT user_id FROM watchlists WHERE id=?', target_id)?.user_id;
    if (owner && owner !== req.user.id && liked) notify(owner, target_type + '_liked', `${req.user.username} liked your ${target_type}.`, { target_type, target_id });
  } catch {}
  res.json({ liked });
});
app.get('/api/comments', (req, res) => {
  const { target_type, target_id } = req.query;
  res.json({ comments: all('SELECT c.*, u.username, u.avatar_url FROM comments c JOIN users u ON u.id=c.user_id WHERE c.target_type=? AND c.target_id=? ORDER BY c.id', target_type, String(target_id)) });
});
app.post('/api/comments', auth, (req, res) => {
  const { target_type, target_id, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'empty' });
  const r = run('INSERT INTO comments(user_id,target_type,target_id,text) VALUES(?,?,?,?)', req.user.id, target_type, String(target_id), text.trim());
  res.json({ id: r.lastInsertRowid });
});

// ================= GALLERY =================
app.get('/api/gallery', optionalAuth, (req, res) => {
  const { type, id, user, limit = 24, offset = 0 } = req.query;
  let q = 'SELECT g.*, u.username, u.avatar_url FROM gallery_posts g JOIN users u ON u.id=g.user_id';
  const p = [];
  if (type && id) { q += ' WHERE g.tmdb_type=? AND g.tmdb_id=?'; p.push(type, id); }
  else if (user) { q += ' WHERE g.user_id=?'; p.push(user); }
  q += ' ORDER BY g.likes_count DESC, g.id DESC LIMIT ? OFFSET ?'; p.push(Number(limit), Number(offset));
  res.json({ posts: all(q, ...p) });
});
app.post('/api/gallery', auth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image required' });
  const { tmdb_type = '', tmdb_id = 0, title_name = '', caption = '', moment = '', tags = '[]' } = req.body;
  const r = run('INSERT INTO gallery_posts(user_id,tmdb_type,tmdb_id,title_name,image_url,caption,moment,tags) VALUES(?,?,?,?,?,?,?,?)',
    req.user.id, tmdb_type, Number(tmdb_id) || 0, title_name, '/uploads/' + req.file.filename, caption, moment, tags);
  logActivity(req.user.id, 'gallery', `uploaded a favorite moment${title_name ? ' from ' + title_name : ''}.`, 'gallery', String(r.lastInsertRowid));
  res.json({ id: r.lastInsertRowid });
});
app.delete('/api/gallery/:id', auth, (req, res) => {
  const g = row('SELECT * FROM gallery_posts WHERE id=?', req.params.id);
  if (!g || (g.user_id !== req.user.id && req.user.role !== 'admin')) return res.status(403).json({ error: 'forbidden' });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(g.image_url))); } catch {}
  run('DELETE FROM gallery_posts WHERE id=?', g.id);
  res.json({ ok: true });
});

// ================= CONNECTIONS =================
function connStatus(a, b) {
  const r = row('SELECT * FROM connections WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)', a, b, b, a);
  if (!r) return 'none';
  if (r.status === 'blocked') return 'blocked';
  if (r.status === 'accepted') return 'connected';
  return r.requester_id === a ? 'sent' : 'incoming';
}
app.get('/api/connections', auth, (req, res) => {
  const allc = all(`SELECT c.*, u.username, u.display_name, u.avatar_url FROM connections c JOIN users u ON u.id=CASE WHEN c.requester_id=? THEN c.addressee_id ELSE c.requester_id END WHERE (c.requester_id=? OR c.addressee_id=?)`, req.user.id, req.user.id, req.user.id);
  res.json({
    connected: allc.filter(c => c.status === 'accepted'),
    incoming: allc.filter(c => c.status === 'pending' && c.addressee_id === req.user.id),
    sent: allc.filter(c => c.status === 'pending' && c.requester_id === req.user.id),
    blocked: allc.filter(c => c.status === 'blocked')
  });
});
app.post('/api/connections/request', auth, (req, res) => {
  const target = row('SELECT * FROM users WHERE id=?', req.body.user_id);
  if (!target || target.id === req.user.id) return res.status(400).json({ error: 'invalid user' });
  const pref = row('SELECT who_can_request FROM user_settings WHERE user_id=?', target.id);
  if (pref?.who_can_request === 'nobody') return res.status(403).json({ error: 'not accepting requests' });
  const st = connStatus(req.user.id, target.id);
  if (st !== 'none') return res.status(400).json({ error: 'already ' + st });
  run('INSERT INTO connections(requester_id,addressee_id,status) VALUES(?,?,?)', req.user.id, target.id, 'pending');
  notify(target.id, 'connection_request', `${req.user.username} sent you a connection request.`, { from: req.user.id });
  res.json({ ok: true });
});
app.post('/api/connections/respond', auth, (req, res) => {
  const { user_id, accept } = req.body;
  const c = row('SELECT * FROM connections WHERE requester_id=? AND addressee_id=? AND status=?', user_id, req.user.id, 'pending');
  if (!c) return res.status(404).json({ error: 'no request' });
  run('UPDATE connections SET status=? WHERE id=?', accept ? 'accepted' : 'declined', c.id);
  if (accept) { notify(user_id, 'connection_accepted', `${req.user.username} accepted your request.`, { from: req.user.id }); logActivity(req.user.id, 'connect', `connected with ${user_id}.`, 'user', String(user_id)); }
  res.json({ ok: true });
});
app.delete('/api/connections/:uid', auth, (req, res) => {
  run('DELETE FROM connections WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)', req.user.id, req.params.uid, req.params.uid, req.user.id);
  res.json({ ok: true });
});
app.post('/api/block', auth, (req, res) => {
  run(`INSERT INTO connections(requester_id,addressee_id,status) VALUES(?,?,'blocked')
    ON CONFLICT(requester_id,addressee_id) DO UPDATE SET status='blocked'`, req.user.id, req.body.user_id);
  res.json({ ok: true });
});
app.get('/api/connection-status/:uid', auth, (req, res) => res.json({ status: connStatus(req.user.id, Number(req.params.uid)) }));

// ================= CHAT =================
function ensureConv(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  let c = row('SELECT * FROM conversations WHERE user1_id=? AND user2_id=?', x, y);
  if (!c) { const r = run('INSERT INTO conversations(user1_id,user2_id) VALUES(?,?)', x, y); c = row('SELECT * FROM conversations WHERE id=?', r.lastInsertRowid); }
  return c;
}
app.get('/api/conversations', auth, (req, res) => {
  const cs = all('SELECT * FROM conversations WHERE user1_id=? OR user2_id=? ORDER BY updated_at DESC', req.user.id, req.user.id);
  res.json({
    conversations: cs.map(c => {
      const other = c.user1_id === req.user.id ? c.user2_id : c.user1_id;
      const u = row('SELECT id,username,display_name,avatar_url FROM users WHERE id=?', other);
      const last = row('SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC', c.id);
      const unread = row('SELECT COUNT(*) c FROM messages WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL', c.id, req.user.id).c;
      return { ...c, other: u, last, unread };
    })
  });
});
app.post('/api/conversations', auth, (req, res) => {
  const other = Number(req.body.user_id);
  const pref = row('SELECT who_can_message FROM user_settings WHERE user_id=?', other);
  const st = connStatus(req.user.id, other);
  if (pref?.who_can_message === 'nobody') return res.status(403).json({ error: 'messaging off' });
  if (pref?.who_can_message === 'connections' && st !== 'connected') return res.status(403).json({ error: 'connections only' });
  res.json({ conversation: ensureConv(req.user.id, other) });
});
app.get('/api/conversations/:id/messages', auth, (req, res) => {
  const c = row('SELECT * FROM conversations WHERE id=?', req.params.id);
  if (!c || (c.user1_id !== req.user.id && c.user2_id !== req.user.id)) return res.status(403).json({ error: 'forbidden' });
  run('UPDATE messages SET read_at=datetime(\'now\') WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL', c.id, req.user.id);
  res.json({ messages: all('SELECT m.*, u.username FROM messages m JOIN users u ON u.id=m.sender_id WHERE conversation_id=? ORDER BY id LIMIT 200', c.id) });
});
app.post('/api/conversations/:id/messages', auth, (req, res) => {
  const c = row('SELECT * FROM conversations WHERE id=?', req.params.id);
  if (!c || (c.user1_id !== req.user.id && c.user2_id !== req.user.id)) return res.status(403).json({ error: 'forbidden' });
  const { text = '', kind = 'text', ref_data = {} } = req.body;
  if (!text.trim() && kind === 'text') return res.status(400).json({ error: 'empty' });
  const r = run('INSERT INTO messages(conversation_id,sender_id,text,kind,ref_data) VALUES(?,?,?,?,?)', c.id, req.user.id, text.trim().slice(0, 2000), kind, JSON.stringify(ref_data));
  run('UPDATE conversations SET updated_at=datetime(\'now\') WHERE id=?', c.id);
  const other = c.user1_id === req.user.id ? c.user2_id : c.user1_id;
  notify(other, 'message', `New message from ${req.user.username}.`, { conversation: c.id });
  res.json({ id: r.lastInsertRowid });
});
app.post('/api/conversations/:id/typing', auth, (req, res) => {
  run('INSERT INTO typing(conversation_id,user_id,updated_at) VALUES(?,?,datetime(\'now\')) ON CONFLICT(conversation_id) DO UPDATE SET user_id=excluded.user_id, updated_at=datetime(\'now\')', req.params.id, req.user.id);
  res.json({ ok: true });
});
app.get('/api/conversations/:id/typing', auth, (req, res) => {
  const t = row('SELECT * FROM typing WHERE conversation_id=?', req.params.id);
  const active = t && t.user_id !== req.user.id && (Date.now() - new Date(t.updated_at.replace(' ', 'T') + 'Z').getTime() < 5000);
  res.json({ typing: !!active });
});
app.get('/api/presence/:uid', auth, (req, res) => {
  // MVP presence: active if messaged/typed in last 5 min
  const t = row(`SELECT updated_at FROM typing WHERE user_id=? UNION ALL SELECT MAX(created_at) updated_at FROM messages WHERE sender_id=?`, req.params.uid, req.params.uid);
  const online = t?.updated_at && (Date.now() - new Date(t.updated_at.replace(' ', 'T') + 'Z').getTime() < 5 * 60e3);
  res.json({ online: !!online });
});

// ================= FEED / ACTIVITY / RECOMMENDATIONS =================
app.get('/api/feed', auth, (req, res) => {
  const friends = all(`SELECT CASE WHEN requester_id=? THEN addressee_id ELSE requester_id END id FROM connections WHERE (requester_id=? OR addressee_id=?) AND status='accepted'`, req.user.id, req.user.id, req.user.id).map(r => r.id);
  const ids = [req.user.id, ...friends];
  const q = `SELECT a.*, u.username, u.avatar_url FROM activity a JOIN users u ON u.id=a.user_id WHERE a.user_id IN (${ids.map(() => '?').join(',')}) ORDER BY a.id DESC LIMIT 40`;
  res.json({ feed: all(q, ...ids) });
});
app.get('/api/friends-activity', auth, (req, res) => {
  const friends = all(`SELECT CASE WHEN requester_id=? THEN addressee_id ELSE requester_id END id FROM connections WHERE (requester_id=? OR addressee_id=?) AND status='accepted'`, req.user.id, req.user.id, req.user.id).map(r => r.id);
  if (!friends.length) return res.json({ items: [] });
  const q = `SELECT a.*, u.username, u.avatar_url FROM activity a JOIN users u ON u.id=a.user_id WHERE a.user_id IN (${friends.map(() => '?').join(',')}) ORDER BY a.id DESC LIMIT 40`;
  res.json({ items: all(q, ...friends) });
});
app.get('/api/recommendations', auth, async (req, res) => {
  const favs = all('SELECT * FROM favorites WHERE user_id=? LIMIT 20', req.user.id);
  const set = row('SELECT favorite_genres, platforms FROM user_settings WHERE user_id=?', req.user.id);
  try {
    if (!TMDB_KEY || !favs.length) {
      const d = await tmdb('/trending/all/week').catch(() => ({ results: [] }));
      return res.json({ groups: [{ title: 'Recommended for you', items: (d.results || []).slice(0, 12) }], note: set ? undefined : '' });
    }
    const seed = favs[0];
    const sim = await tmdb(`/${seed.tmdb_type}/${seed.tmdb_id}/recommendations`).catch(() => ({ results: [] }));
    res.json({ groups: [{ title: `Because you liked title #${seed.tmdb_id}`, items: (sim.results || []).slice(0, 12) }, { title: 'You may also like', items: (sim.results || []).slice(12, 24) }] });
  } catch { res.json({ groups: [] }); }
});

// ================= NOTIFICATIONS / REPORTS / ADMIN =================
app.get('/api/notifications', auth, (req, res) => {
  res.json({ notifications: all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50', req.user.id), unread: row('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_flag=0', req.user.id).c });
});
app.post('/api/notifications/read', auth, (req, res) => {
  if (req.body.all) run('UPDATE notifications SET read_flag=1 WHERE user_id=?', req.user.id);
  else run('UPDATE notifications SET read_flag=1 WHERE id=? AND user_id=?', req.body.id, req.user.id);
  res.json({ ok: true });
});
app.post('/api/reports', auth, (req, res) => {
  const { target_type, target_id, reason } = req.body;
  run('INSERT INTO reports(reporter_id,target_type,target_id,reason) VALUES(?,?,?,?)', req.user.id, target_type, String(target_id), reason || '');
  res.json({ ok: true });
});
const isAdmin = (req, res, next) => { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' }); next(); };
app.get('/api/admin/overview', auth, isAdmin, (req, res) => {
  res.json({
    users: row('SELECT COUNT(*) c FROM users').c,
    reviews: row('SELECT COUNT(*) c FROM reviews').c,
    gallery: row('SELECT COUNT(*) c FROM gallery_posts').c,
    reports: row('SELECT COUNT(*) c FROM reports WHERE status=?', 'open').c,
    messages: row('SELECT COUNT(*) c FROM messages').c
  });
});
app.get('/api/admin/reports', auth, isAdmin, (req, res) => res.json({ reports: all('SELECT * FROM reports ORDER BY id DESC LIMIT 100') }));
app.post('/api/admin/reports/:id', auth, isAdmin, (req, res) => {
  run('UPDATE reports SET status=? WHERE id=?', req.body.status || 'resolved', req.params.id);
  res.json({ ok: true });
});
app.post('/api/admin/moderate', auth, isAdmin, (req, res) => {
  const { target_type, target_id } = req.body;
  if (target_type === 'review') run('DELETE FROM reviews WHERE id=?', target_id);
  if (target_type === 'gallery') run('DELETE FROM gallery_posts WHERE id=?', target_id);
  if (target_type === 'user') run('UPDATE users SET is_banned=1 WHERE id=?', target_id);
  res.json({ ok: true });
});
app.get('/api/admin/users', auth, isAdmin, (req, res) => res.json({ users: all('SELECT id,username,display_name,email,role,is_banned,created_at FROM users ORDER BY id DESC LIMIT 100') }));

// ================= PUBLIC PROFILE =================
app.get('/api/users/:username', optionalAuth, (req, res) => {
  const u = row('SELECT * FROM users WHERE username=? COLLATE NOCASE', req.params.username);
  if (!u) return res.status(404).json({ error: 'not found' });
  const s = row('SELECT * FROM user_settings WHERE user_id=?', u.id);
  const vis = s?.profile_visibility || 'public';
  if (vis === 'private' && req.user?.id !== u.id && req.user?.role !== 'admin') return res.status(403).json({ error: 'private profile' });
  if (vis === 'connections' && req.user?.id !== u.id) {
    const st = req.user ? connStatus(req.user.id, u.id) : 'none';
    if (st !== 'connected' && req.user?.role !== 'admin') return res.status(403).json({ error: 'connections only' });
  }
  res.json({
    user: pub(u),
    settings: s ? { favorite_genres: JSON.parse(s.favorite_genres || '[]'), favorite_movies: JSON.parse(s.favorite_movies || '[]'), favorite_series: JSON.parse(s.favorite_series || '[]'), platforms: JSON.parse(s.platforms || '[]'), social_links: JSON.parse(s.social_links || '{}'), public_sections: JSON.parse(s.public_sections || '{}') } : null,
    counts: {
      connections: row("SELECT COUNT(*) c FROM connections WHERE (requester_id=? OR addressee_id=?) AND status='accepted'", u.id, u.id).c,
      reviews: row('SELECT COUNT(*) c FROM reviews WHERE user_id=?', u.id).c,
      gallery: row('SELECT COUNT(*) c FROM gallery_posts WHERE user_id=?', u.id).c
    },
    connection: req.user ? connStatus(req.user.id, u.id) : 'none'
  });
});

// SPA fallback (shareable /movie/slug, /@user/list, /title/...)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`CineLink on http://localhost:${PORT} ${TMDB_KEY ? '(TMDB live)' : '(demo mode — set TMDB_API_KEY for live artwork)'}`));
