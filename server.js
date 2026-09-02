const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'pulsetrack.db');

// Ensure DB exists or init
if (!fs.existsSync(dbPath)) {
    console.log('Database not found. Initializing...');
    require('./init-db.js');
}

const db = new sqlite3.Database(dbPath);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route serves the classic landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Histats-style Control Panel URL /viewstats/?act=1
app.get('/viewstats', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Helper promise wrappers for sqlite3
const dbAll = (query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
});

const dbGet = (query, params = []) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => err ? reject(err) : resolve(row));
});

const dbRun = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
    });
});

// --- API: COLLECT (Ingestion) ---
app.post('/api/collect', async (req, res) => {
    try {
        const data = req.body || {};
        const siteId = data.site_id || 'default';
        const sessionId = data.session_id || 'unknown';
        const visitorId = data.visitor_id || 'unknown';
        const type = data.type || 'pageview';

        // Local Geo fallback
        const country = req.headers['cf-ipcountry'] || data.country || 'ID';
        const city = req.headers['cf-ipcity'] || data.city || 'Jakarta';

        let referrerDomain = 'Direct / None';
        if (data.referrer) {
            try {
                const url = new URL(data.referrer);
                referrerDomain = url.hostname.replace(/^www\./, '');
            } catch (e) {
                referrerDomain = 'Direct / None';
            }
        }

        // Auto-register site if not exists
        try {
            const domainName = siteId.includes('.') ? siteId : (data.domain || referrerDomain || siteId);
            await dbRun(`
                INSERT OR IGNORE INTO sites (id, name, domain, created_at, settings)
                VALUES (?, ?, ?, datetime('now'), '{}')
            `, [siteId, domainName, domainName]);
        } catch (e) { }

        if (type === 'pageview') {
            const path = data.path || '/';
            const title = data.title || '';
            const referrer = data.referrer || '';
            const keyword = (data.keyword || '').trim();
            const searchEngine = (data.search_engine || '').trim();
            const browser = data.browser || 'Unknown';
            const os = data.os || 'Unknown';
            const device = data.device || 'desktop';
            const screen = data.screen || '';
            const utmSource = data.utm_source || '';
            const utmMedium = data.utm_medium || '';
            const utmCampaign = data.utm_campaign || '';
            const utmTerm = data.utm_term || '';

            const todayStr = new Date().toISOString().split('T')[0];
            const checkUnique = await dbGet(
                'SELECT COUNT(*) as count FROM pageviews WHERE site_id = ? AND visitor_id = ? AND created_at >= ?',
                [siteId, visitorId, todayStr + ' 00:00:00']
            );
            const isUnique = (checkUnique && checkUnique.count > 0) ? 0 : 1;

            await dbRun(`
                INSERT INTO pageviews (
                    site_id, session_id, visitor_id, path, title,
                    referrer, referrer_domain, keyword, search_engine,
                    country, city, browser, os, device, screen,
                    utm_source, utm_medium, utm_campaign, utm_term, is_unique
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                siteId, sessionId, visitorId, path, title,
                referrer, referrerDomain, keyword, searchEngine,
                country, city, browser, os, device, screen,
                utmSource, utmMedium, utmCampaign, utmTerm, isUnique
            ]);

            await dbRun(`
                INSERT INTO heartbeats (session_id, site_id, path, title, country, city, browser, device, last_ping)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(session_id) DO UPDATE SET
                    path = excluded.path,
                    title = excluded.title,
                    last_ping = datetime('now')
            `, [sessionId, siteId, path, title, country, city, browser, device]);

            return res.json({ ok: true, status: 'pageview_recorded' });

        } else if (type === 'heartbeat') {
            const path = data.path || '/';
            const title = data.title || '';
            const duration = parseInt(data.duration || 0, 10);
            const browser = data.browser || 'Unknown';
            const device = data.device || 'desktop';

            await dbRun(`
                INSERT INTO heartbeats (session_id, site_id, path, title, country, city, browser, device, last_ping)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(session_id) DO UPDATE SET
                    path = excluded.path,
                    title = excluded.title,
                    last_ping = datetime('now')
            `, [sessionId, siteId, path, title, country, city, browser, device]);

            if (duration > 0) {
                await dbRun(`
                    UPDATE pageviews 
                    SET duration = ? 
                    WHERE id = (
                        SELECT id FROM pageviews 
                        WHERE session_id = ? AND site_id = ? 
                        ORDER BY id DESC LIMIT 1
                    )
                `, [duration, sessionId, siteId]);
            }

            return res.json({ ok: true, status: 'heartbeat_updated' });

        } else if (type === 'event') {
            const eventName = data.event_name || 'custom';
            const eventData = data.event_data || '{}';
            const path = data.path || '/';

            await dbRun(`
                INSERT INTO events (site_id, session_id, event_name, event_data, path)
                VALUES (?, ?, ?, ?, ?)
            `, [siteId, sessionId, eventName, eventData, path]);

            return res.json({ ok: true, status: 'event_recorded' });
        }

        res.status(400).json({ error: 'Invalid type' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: STATS (Aggregations & Keyword Top 100) ---
app.get('/api/stats', async (req, res) => {
    try {
        const userId = getUserIdFromReq(req) || 'user_admin';
        const siteId = req.query.site_id || 'all';
        const period = req.query.period || '7d';
        const startDate = req.query.start;
        const endDate = req.query.end;

        let baseParams = [];
        let siteCondition = '';
        if (siteId && siteId !== 'all') {
            siteCondition = 'AND p.site_id = ?';
            baseParams.push(siteId);
        } else {
            siteCondition = 'AND p.site_id IN (SELECT id FROM sites WHERE user_id = ? OR "user_admin" = ?)';
            baseParams.push(userId, userId);
        }

        let dateCondition = '';
        let dateParams = [];
        const now = new Date();
        const formatDate = (d) => d.toISOString().split('T')[0];

        if (period === 'today') {
            dateCondition = 'AND p.created_at >= ?';
            dateParams.push(formatDate(now) + ' 00:00:00');
        } else if (period === 'yesterday') {
            const yest = new Date(now);
            yest.setDate(yest.getDate() - 1);
            const yestStr = formatDate(yest);
            dateCondition = 'AND p.created_at >= ? AND p.created_at <= ?';
            dateParams.push(yestStr + ' 00:00:00', yestStr + ' 23:59:59');
        } else if (period === '7d') {
            const d7 = new Date(now);
            d7.setDate(d7.getDate() - 7);
            dateCondition = 'AND p.created_at >= ?';
            dateParams.push(formatDate(d7) + ' 00:00:00');
        } else if (period === '30d') {
            const d30 = new Date(now);
            d30.setDate(d30.getDate() - 30);
            dateCondition = 'AND p.created_at >= ?';
            dateParams.push(formatDate(d30) + ' 00:00:00');
        } else if (period === 'custom' && startDate && endDate) {
            dateCondition = 'AND p.created_at >= ? AND p.created_at <= ?';
            dateParams.push(startDate + ' 00:00:00', endDate + ' 23:59:59');
        }

        const fullParams = [...baseParams, ...dateParams];

        // 1. Overview Summary
        const summary = await dbGet(`
            SELECT 
                COUNT(*) as total_pageviews,
                COUNT(DISTINCT p.visitor_id) as unique_visitors,
                COUNT(DISTINCT p.session_id) as total_sessions,
                AVG(p.duration) as avg_duration,
                SUM(CASE WHEN p.duration < 5 THEN 1 ELSE 0 END) * 100.0 / MAX(COUNT(*), 1) as bounce_rate
            FROM pageviews p
            WHERE 1=1 ${siteCondition} ${dateCondition}
        `, fullParams) || {};

        // 2. Realtime online
        let onlineParams = [];
        let hbSiteCondition = '';
        if (siteId && siteId !== 'all') {
            hbSiteCondition = 'AND site_id = ?';
            onlineParams.push(siteId);
        } else {
            hbSiteCondition = 'AND site_id IN (SELECT id FROM sites WHERE user_id = ? OR "user_admin" = ?)';
            onlineParams.push(userId, userId);
        }
        const onlineRes = await dbGet(`
            SELECT COUNT(*) as online_count 
            FROM heartbeats 
            WHERE last_ping >= datetime('now', '-5 minutes') ${hbSiteCondition}
        `, onlineParams);

        // 3. Time Series Chart Data
        const isHourly = period === 'today' || period === 'yesterday';
        const groupFormat = isHourly ? '%Y-%m-%d %H:00' : '%Y-%m-%d';
        const chartData = await dbAll(`
            SELECT 
                strftime('${groupFormat}', p.created_at) as time_bucket,
                COUNT(*) as pageviews,
                COUNT(DISTINCT p.visitor_id) as visitors
            FROM pageviews p
            WHERE 1=1 ${siteCondition} ${dateCondition}
            GROUP BY time_bucket
            ORDER BY time_bucket ASC
        `, fullParams);

        // 4. TOP 100 URLs Teratas
        const topPages = await dbAll(`
            SELECT 
                p.path, 
                p.site_id,
                COALESCE(s.domain, p.site_id) as domain,
                p.title, 
                COUNT(*) as views, 
                COUNT(DISTINCT p.visitor_id) as visitors
            FROM pageviews p
            LEFT JOIN sites s ON p.site_id = s.id
            WHERE 1=1 ${siteCondition} ${dateCondition}
            GROUP BY p.site_id, p.path
            ORDER BY views DESC
            LIMIT 100
        `, fullParams);

        // 5. TOP 100 Keywords Teratas
        const topKeywords = await dbAll(`
            SELECT 
                p.keyword,
                COALESCE(NULLIF(p.search_engine, ''), 'Google') as source,
                p.site_id,
                COALESCE(s.domain, p.site_id) as domain,
                p.path,
                COUNT(*) as hits,
                COUNT(DISTINCT p.visitor_id) as visitors
            FROM pageviews p
            LEFT JOIN sites s ON p.site_id = s.id
            WHERE p.keyword != '' ${siteCondition} ${dateCondition}
            GROUP BY p.keyword, p.site_id
            ORDER BY hits DESC
            LIMIT 100
        `, fullParams);

        // 6. TOP Domains Teratas
        const topDomains = await dbAll(`
            SELECT 
                COALESCE(s.domain, p.site_id) as domain,
                s.name,
                p.site_id,
                COUNT(*) as views,
                COUNT(DISTINCT p.visitor_id) as visitors,
                COUNT(DISTINCT NULLIF(p.keyword, '')) as total_kw
            FROM pageviews p
            LEFT JOIN sites s ON p.site_id = s.id
            WHERE 1=1 ${siteCondition} ${dateCondition}
            GROUP BY p.site_id
            ORDER BY views DESC
            LIMIT 50
        `, fullParams);

        // 7. Top Referrers
        const topReferrers = await dbAll(`
            SELECT p.referrer_domain as domain, COUNT(*) as count
            FROM pageviews p
            WHERE 1=1 ${siteCondition} ${dateCondition}
            GROUP BY p.referrer_domain
            ORDER BY count DESC
            LIMIT 15
        `, fullParams);

        // 8. Countries
        const topCountries = await dbAll(`
            SELECT p.country, COUNT(*) as count
            FROM pageviews p
            WHERE 1=1 ${siteCondition} ${dateCondition}
            GROUP BY p.country
            ORDER BY count DESC
            LIMIT 15
        `, fullParams);

        // 9. Search Engines Breakdown
        const searchEngines = await dbAll(`
            SELECT 
                COALESCE(NULLIF(p.search_engine, ''), 'Google') as name,
                COUNT(*) as count
            FROM pageviews p
            WHERE (p.search_engine != '' OR p.referrer_domain LIKE '%google%' OR p.referrer_domain LIKE '%bing%' OR p.referrer_domain LIKE '%yahoo%' OR p.referrer_domain LIKE '%duckduckgo%') ${siteCondition} ${dateCondition}
            GROUP BY name
            ORDER BY count DESC
        `, fullParams);

        // 10. Devices, Browsers, OS
        const devices = await dbAll(`SELECT p.device as name, COUNT(*) as count FROM pageviews p WHERE 1=1 ${siteCondition} ${dateCondition} GROUP BY p.device ORDER BY count DESC`, fullParams);
        const browsers = await dbAll(`SELECT p.browser as name, COUNT(*) as count FROM pageviews p WHERE 1=1 ${siteCondition} ${dateCondition} GROUP BY p.browser ORDER BY count DESC LIMIT 6`, fullParams);
        const oss = await dbAll(`SELECT p.os as name, COUNT(*) as count FROM pageviews p WHERE 1=1 ${siteCondition} ${dateCondition} GROUP BY p.os ORDER BY count DESC LIMIT 6`, fullParams);

        // 11. Live recent feed
        const recent = await dbAll(`
            SELECT p.path, p.title, COALESCE(s.domain, p.site_id) as domain, p.referrer_domain, p.keyword, p.search_engine, p.country, p.city, p.browser, p.os, p.device, p.created_at 
            FROM pageviews p
            LEFT JOIN sites s ON p.site_id = s.id
            WHERE 1=1 ${siteCondition}
            ORDER BY p.id DESC
            LIMIT 20
        `, baseParams);

        res.json({
            ok: true,
            site_id: siteId,
            period: period,
            summary: {
                total_pageviews: summary.total_pageviews || 0,
                unique_visitors: summary.unique_visitors || 0,
                total_sessions: summary.total_sessions || 0,
                avg_duration: Math.round(summary.avg_duration || 0),
                bounce_rate: Math.round(summary.bounce_rate || 0),
                online_now: onlineRes ? onlineRes.online_count : 0
            },
            chart: chartData,
            pages: topPages,
            keywords: topKeywords,
            domains: topDomains,
            search_engines: searchEngines,
            referrers: topReferrers,
            countries: topCountries,
            devices: devices,
            browsers: browsers,
            os: oss,
            recent: recent
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: REALTIME ---
app.get('/api/realtime', async (req, res) => {
    try {
        const siteId = req.query.site_id || 'demo-site-1';
        const activeList = await dbAll(`
            SELECT session_id, path, title, country, city, browser, device, last_ping
            FROM heartbeats
            WHERE site_id = ? AND last_ping >= datetime('now', '-3 minutes')
            ORDER BY last_ping DESC
        `, [siteId]);

        const activePages = await dbAll(`
            SELECT path, COUNT(*) as active_count
            FROM heartbeats
            WHERE site_id = ? AND last_ping >= datetime('now', '-3 minutes')
            GROUP BY path
            ORDER BY active_count DESC
            LIMIT 10
        `, [siteId]);

        res.json({
            ok: true,
            site_id: siteId,
            online_count: activeList.length,
            active_visitors: activeList,
            active_pages: activePages,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUTH HELPERS ---
function getUserIdFromReq(req) {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.replace(/^Bearer\s+/i, '').trim();
        if (!token) return null;
        const json = Buffer.from(token, 'base64').toString('utf8');
        const decoded = JSON.parse(json);
        if (decoded.exp && decoded.exp < Date.now()) return null;
        return decoded.userId || null;
    } catch (e) {
        return null;
    }
}

function generateToken(userId, email) {
    const payload = JSON.stringify({ userId, email, exp: Date.now() + 30 * 24 * 3600 * 1000 });
    return Buffer.from(payload).toString('base64');
}

// --- API: AUTH ---
app.post('/api/auth', async (req, res) => {
    try {
        const action = req.query.action || 'login';
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';
        const name = (req.body.name || email.split('@')[0] || 'User').trim();

        if (!email || !password) {
            return res.status(400).json({ error: 'Email dan password wajib diisi' });
        }

        if (action === 'register') {
            const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
            if (existing) {
                return res.status(400).json({ error: 'Email sudah terdaftar. Silakan login.' });
            }

            const userId = 'usr_' + Math.random().toString(36).substring(2, 10);
            await dbRun(`
                INSERT INTO users (id, email, password_hash, name, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `, [userId, email, password, name]);

            const token = generateToken(userId, email);
            return res.json({ ok: true, user: { id: userId, email, name }, token });

        } else if (action === 'login') {
            const user = await dbGet('SELECT id, email, password_hash, name FROM users WHERE email = ?', [email]);
            if (!user || user.password_hash !== password) {
                return res.status(401).json({ error: 'Email atau password salah' });
            }

            const token = generateToken(user.id, user.email);
            return res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name }, token });
        }

        res.status(400).json({ error: 'Aksi tidak valid' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth', async (req, res) => {
    const userId = getUserIdFromReq(req);
    if (!userId) {
        return res.status(401).json({ ok: false, error: 'Not logged in' });
    }
    const user = await dbGet('SELECT id, email, name FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({ ok: true, user });
});

// --- API: SITES (Strict Multi-User Isolated) ---
app.get('/api/sites', async (req, res) => {
    try {
        const userId = getUserIdFromReq(req) || 'user_admin';
        const todayStr = new Date().toISOString().split('T')[0];

        const query = `
            SELECT s.id, s.user_id, s.name, s.domain, s.created_at, s.settings,
                   (SELECT COUNT(*) FROM pageviews WHERE site_id = s.id) as total_views,
                   (SELECT COUNT(DISTINCT visitor_id) FROM pageviews WHERE site_id = s.id) as total_visitors,
                   (SELECT COUNT(*) FROM pageviews WHERE site_id = s.id AND created_at >= '${todayStr} 00:00:00') as pageviews_today,
                   (SELECT COUNT(DISTINCT visitor_id) FROM pageviews WHERE site_id = s.id AND created_at >= '${todayStr} 00:00:00') as visitors_today,
                   (SELECT COUNT(*) FROM heartbeats WHERE site_id = s.id AND last_ping >= datetime('now', '-5 minutes')) as online_now
            FROM sites s
            WHERE s.user_id = ?
            ORDER BY s.created_at DESC
        `;

        const sites = await dbAll(query, [userId]);
        res.json({ ok: true, sites });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sites', async (req, res) => {
    try {
        const userId = getUserIdFromReq(req) || 'user_admin';
        const name = (req.body.name || '').trim();
        const domain = (req.body.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        
        if (!name || !domain) {
            return res.status(400).json({ error: 'Name and domain are required' });
        }

        let siteId = (req.body.id || '').trim();
        if (!siteId) {
            const cleanDomain = domain.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '');
            siteId = 'site-' + cleanDomain + '-' + Math.random().toString(36).substring(2, 6);
        }

        await dbRun(`
            INSERT INTO sites (id, user_id, name, domain, created_at, settings)
            VALUES (?, ?, ?, ?, datetime('now'), ?)
            ON CONFLICT(id) DO UPDATE SET
                user_id = excluded.user_id,
                name = excluded.name,
                domain = excluded.domain,
                settings = excluded.settings
        `, [siteId, userId, name, domain, JSON.stringify(req.body.settings || {})]);

        res.json({ ok: true, site: { id: siteId, name, domain, user_id: userId } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/sites', async (req, res) => {
    try {
        const userId = getUserIdFromReq(req);
        const siteId = req.query.id;
        if (!siteId) return res.status(400).json({ error: 'Site ID required' });

        let delQuery = 'DELETE FROM sites WHERE (id = ? OR domain = ?)';
        let params = [siteId, siteId];

        if (userId) {
            delQuery += ' AND user_id = ?';
            params.push(userId);
        }

        await dbRun(delQuery, params);
        await dbRun('DELETE FROM pageviews WHERE site_id = ?', [siteId]);
        await dbRun('DELETE FROM heartbeats WHERE site_id = ?', [siteId]);
        await dbRun('DELETE FROM events WHERE site_id = ?', [siteId]);

        res.json({ ok: true, deleted_id: siteId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API: BADGE (Dynamic Histats SVG Badge) ---
app.get('/api/badge', async (req, res) => {
    try {
        const siteId = req.query.site_id || 'demo-site-1';
        const theme = req.query.theme || 'modern';
        const formatNum = (num) => Number(num).toLocaleString();

        const onlineRes = await dbGet(`SELECT COUNT(*) as count FROM heartbeats WHERE site_id = ? AND last_ping >= datetime('now', '-5 minutes')`, [siteId]);
        const online = onlineRes ? onlineRes.count : 0;

        const todayStr = new Date().toISOString().split('T')[0];
        const todayRes = await dbGet(`SELECT COUNT(*) as count FROM pageviews WHERE site_id = ? AND created_at >= ?`, [siteId, todayStr + ' 00:00:00']);
        const today = todayRes ? todayRes.count : 0;

        const totalRes = await dbGet(`SELECT COUNT(*) as count FROM pageviews WHERE site_id = ?`, [siteId]);
        const total = totalRes ? totalRes.count : 0;

        let svg = '';

        if (theme === 'classic') {
            svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="130" height="60" viewBox="0 0 130 60">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2a2e39"/>
      <stop offset="100%" stop-color="#15171c"/>
    </linearGradient>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="130" height="60" rx="4" fill="url(#bgGrad)" stroke="#38404d" stroke-width="1.5"/>
  <rect x="0" y="0" width="130" height="15" rx="3" fill="url(#headerGrad)"/>
  <text x="65" y="11" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="9" font-weight="bold" text-anchor="middle" letter-spacing="0.5">PULSE STATS</text>
  
  <circle cx="12" cy="25" r="3.5" fill="#22c55e"/>
  <text x="20" y="28" fill="#94a3b8" font-family="sans-serif" font-size="8.5">Online:</text>
  <text x="120" y="28" fill="#4ade80" font-family="'Courier New', monospace" font-size="9.5" font-weight="bold" text-anchor="end">${formatNum(online)}</text>
  
  <text x="10" y="41" fill="#94a3b8" font-family="sans-serif" font-size="8.5">Today:</text>
  <text x="120" y="41" fill="#f8fafc" font-family="'Courier New', monospace" font-size="9.5" font-weight="bold" text-anchor="end">${formatNum(today)}</text>
  
  <text x="10" y="53" fill="#94a3b8" font-family="sans-serif" font-size="8.5">Total:</text>
  <text x="120" y="53" fill="#38bdf8" font-family="'Courier New', monospace" font-size="9.5" font-weight="bold" text-anchor="end">${formatNum(total)}</text>
</svg>`;
        } else if (theme === 'neon') {
            svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="38" viewBox="0 0 160 38">
  <defs>
    <linearGradient id="neonBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
  </defs>
  <rect width="160" height="38" rx="8" fill="url(#neonBg)" stroke="#10b981" stroke-width="1.2"/>
  <circle cx="15" cy="19" r="4" fill="#10b981"/>
  <circle cx="15" cy="19" r="2" fill="#ffffff"/>
  <text x="26" y="16" fill="#10b981" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="8" font-weight="bold" letter-spacing="1">LIVE USERS</text>
  <text x="26" y="29" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="12" font-weight="bold">${formatNum(online)}</text>
  <line x1="88" y1="8" x2="88" y2="30" stroke="#334155" stroke-width="1"/>
  <text x="96" y="16" fill="#94a3b8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="8" font-weight="bold" letter-spacing="0.5">TODAY</text>
  <text x="96" y="29" fill="#38bdf8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="12" font-weight="bold">${formatNum(today)}</text>
</svg>`;
        } else if (theme === 'minimal') {
            svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="24" viewBox="0 0 120 24">
  <rect width="120" height="24" rx="4" fill="#1e293b"/>
  <rect width="60" height="24" rx="4" fill="#0f172a"/>
  <circle cx="10" cy="12" r="3" fill="#22c55e"/>
  <text x="18" y="15" fill="#94a3b8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="9" font-weight="600">ONLINE</text>
  <text x="90" y="15" fill="#f8fafc" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="10" font-weight="bold" text-anchor="middle">${formatNum(online)}</text>
</svg>`;
        } else {
            svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="34" viewBox="0 0 180 34">
  <defs>
    <linearGradient id="pillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="180" height="34" rx="17" fill="url(#pillGrad)" stroke="#4f46e5" stroke-width="1.2"/>
  <circle cx="16" cy="17" r="4.5" fill="#22c55e"/>
  <circle cx="16" cy="17" r="2" fill="#ffffff"/>
  <text x="26" y="21" fill="#818cf8" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="9" font-weight="bold">ONLINE</text>
  <text x="70" y="21" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="11" font-weight="bold">${formatNum(online)}</text>
  <circle cx="98" cy="17" r="2" fill="#475569"/>
  <text x="108" y="21" fill="#94a3b8" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="9" font-weight="bold">TOTAL</text>
  <text x="144" y="21" fill="#38bdf8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="11" font-weight="bold">${formatNum(total)}</text>
</svg>`;
        }

        res.set({
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.send(svg.trim());
    } catch (err) {
        res.status(500).send('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20"><text y="15" fill="red">Error</text></svg>');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 PulseTrack Server is running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/index.html`);
    console.log(`🔧 Embed Generator: http://localhost:${PORT}/embed-generator.html`);
    console.log(`🧪 Demo Test Site: http://localhost:${PORT}/demo.html`);
});
