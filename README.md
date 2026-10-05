# CineLink — Watch. Share. Connect.

Social platform for movie & TV lovers. Dark cinematic UI (crimson global accent, per-title dynamic accent), real backend + SQLite persistence, TMDB-powered Cinematic Title Pages.

## Quick start
```powershell
Copy-Item .env.example .env   # add TMDB_API_KEY (optional — app runs in demo mode without it)
npm install
npm start                     # http://localhost:3100
```

## 16-flow smoke test (after signup)
1. Sign up → 2. Edit profile (#/settings) → 3. Search (#/discover or top bar) →
4. Open title (`#/title/movie/27205/...`) with its own backdrop/cast/gallery →
5. ＋ Watchlist → 6. ✅ Watched → 7. ★ Rate → 8. ✍ Review →
9. Upload moment (#/gallery) → 10. Request connection (profile → Add Connection) →
11. Accept (other user #/connections) → 12. View friend profile (#/u/name) →
13. Like review/list/post → 14. Chat (#/messages, rich share cards) →
15. Share list (`/@user/slug`) → 16. Privacy (#/settings → Privacy).

Demo seed: set `ADMIN_EMAIL`? First user can be promoted via sqlite:
`node -e "const{run}=require('./db');run(\"UPDATE users SET role='admin' WHERE id=1\")"`

## Notes
- TMDB key stays server-side (`server.js` → `/api/title/*` proxy, 24h SQLite cache in `titles`).
  Without a key the app serves curated demo payloads so every flow is testable offline.
- Accent color: `accentFor()` is a deterministic vibrant pick (genre-aware particle mood included).
  Swap with `node-vibrant` on the w92 poster for exact extraction — marked TODO in code.
- Uploads in `./uploads` (8MB cap). Trailers via `youtube-nocookie.com` embeds only.
- Attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB."
- Never present unconfirmed availability as live — empty providers show "Availability not confirmed".
