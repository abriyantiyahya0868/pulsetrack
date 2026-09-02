const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'pulsetrack.db');
const schemaPath = path.join(__dirname, 'schema.sql');

console.log('Initializing SQLite Database at:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database.');
});

const schema = fs.readFileSync(schemaPath, 'utf8');

db.exec(schema, (err) => {
    if (err) {
        console.error('Error executing schema:', err.message);
    } else {
        console.log('✅ Database schema applied successfully!');
        
        // Seed some sample analytics data if empty
        db.get("SELECT COUNT(*) as count FROM pageviews", (err, row) => {
            if (!err && row && row.count === 0) {
                console.log('🌱 Seeding initial sample traffic data...');
                seedData(db);
            } else {
                db.close();
            }
        });
    }
});

function seedData(db) {
    const initialSites = [
        { id: '5046021', name: 'Testing Advansid', domain: 'testing.advansid.com', todayVis: 425, todayViews: 1317, totalVis: 11915, totalViews: 18980, online: 3 },
        { id: '5047261', name: 'Tools Pafyll', domain: 'tools.pafyll.com', todayVis: 47, todayViews: 146, totalVis: 583, totalViews: 1054, online: 1 },
        { id: '5047830', name: 'Relatorios Evolutto', domain: 'relatorios.evolutto.com.br', todayVis: 16, todayViews: 47, totalVis: 153, totalViews: 402, online: 0 },
        { id: '5048028', name: 'Promo Winstar', domain: 'promo.winstar.com', todayVis: 31, todayViews: 89, totalVis: 205, totalViews: 502, online: 0 },
        { id: '5048428', name: 'Test Digital Interruption', domain: 'test.digitalinterruption.com', todayVis: 10, todayViews: 40, totalVis: 24, totalViews: 117, online: 0 },
        { id: '5048429', name: 'Mobi Capegrace', domain: 'mobi.capegrace.com', todayVis: 16, todayViews: 49, totalVis: 25, totalViews: 82, online: 0 }
    ];

    // Seed default admin user
    db.run('INSERT OR REPLACE INTO users (id, email, password_hash, name) VALUES ("user_admin", "admin@domain.com", "123456", "Administrator")');

    const siteStmt = db.prepare('INSERT OR REPLACE INTO sites (id, user_id, name, domain, created_at, settings) VALUES (?, "user_admin", ?, ?, datetime("now"), ?)');
    initialSites.forEach(s => {
        siteStmt.run(s.id, s.name, s.domain, JSON.stringify({ category: 'Technology', country: 'ID', timezone: 'Asia/Jakarta' }));
    });
    siteStmt.finalize();
    const browsers = ['Chrome', 'Safari', 'Firefox', 'Edge'];
    const oss = ['Windows', 'macOS', 'Android', 'iOS', 'Linux'];
    const devices = ['desktop', 'mobile', 'tablet'];
    const countries = ['ID', 'US', 'SG', 'MY', 'GB', 'DE', 'AU', 'JP'];
    const cities = {
        'ID': ['Jakarta', 'Surabaya', 'Bandung', 'Yogyakarta'],
        'US': ['New York', 'Los Angeles', 'Chicago'],
        'SG': ['Singapore'],
        'MY': ['Kuala Lumpur'],
        'GB': ['London'],
        'DE': ['Berlin'],
        'AU': ['Sydney'],
        'JP': ['Tokyo']
    };
    const paths = [
        '/', '/about', '/blog/cara-buat-website', '/pricing', '/contact',
        '/blog/seo-tips-2026', '/features', '/docs/getting-started'
    ];
    const titles = {
        '/': 'Home - My Awesome Website',
        '/about': 'About Us - My Awesome Website',
        '/blog/cara-buat-website': 'Tutorial: Cara Buat Website Sendiri',
        '/pricing': 'Pricing & Plans',
        '/contact': 'Hubungi Kami',
        '/blog/seo-tips-2026': '10 Tips SEO Paling Ampuh 2026',
        '/features': 'Product Features',
        '/docs/getting-started': 'Documentation - Getting Started'
    };
    const referrers = [
        { ref: 'https://www.google.com/search?q=my+website', domain: 'google.com' },
        { ref: 'https://m.facebook.com/', domain: 'facebook.com' },
        { ref: 'https://t.co/abcxyz', domain: 't.co' },
        { ref: 'https://www.youtube.com/', domain: 'youtube.com' },
        { ref: '', domain: 'Direct / None' }
    ];

    const sampleKeywords = [
        { kw: 'gaji perawat icu texas alliance', se: 'Google' },
        { kw: 'lowongan kerja perawat usa 2026', se: 'Google' },
        { kw: 'advisor development program bank of america', se: 'Google' },
        { kw: 'financial solutions advisor salary', se: 'Bing' },
        { kw: 'critical care registered nurse rn jobs', se: 'Google' },
        { kw: 'apexhire verified healthcare jobs', se: 'Yahoo' },
        { kw: 'cara membuat website tracker mirip histats', se: 'Google' },
        { kw: 'cloudflare pages free web analytics', se: 'DuckDuckGo' },
        { kw: 'live traffic counter widget html', se: 'Google' },
        { kw: 'tutorial deploy d1 database sqlite', se: 'Google' }
    ];

    const stmt = db.prepare(`
        INSERT INTO pageviews (
            site_id, session_id, visitor_id, path, title,
            referrer, referrer_domain, keyword, search_engine, country, city,
            browser, os, device, screen, duration, is_unique, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date();
    // Seed records across the last 30 days
    for (let d = 30; d >= 0; d--) {
        const date = new Date(now);
        date.setDate(date.getDate() - d);

        const countPerDay = Math.floor(Math.random() * 30) + 20;
        for (let i = 0; i < countPerDay; i++) {
            const h = Math.floor(Math.random() * 24);
            const m = Math.floor(Math.random() * 60);
            const s = Math.floor(Math.random() * 60);
            date.setHours(h, m, s);

            const country = countries[Math.floor(Math.random() * countries.length)];
            const cityList = cities[country] || ['Unknown'];
            const city = cityList[Math.floor(Math.random() * cityList.length)];
            const path = paths[Math.floor(Math.random() * paths.length)];
            const ref = referrers[Math.floor(Math.random() * referrers.length)];
            const browser = browsers[Math.floor(Math.random() * browsers.length)];
            const os = oss[Math.floor(Math.random() * oss.length)];
            const device = devices[Math.floor(Math.random() * devices.length)];
            const visitorId = 'v_seed_' + (Math.floor(Math.random() * 100) + 1);
            const sessionId = 's_seed_' + (Math.floor(Math.random() * 200) + 1);
            const duration = Math.floor(Math.random() * 120) + 5;
            const isUnique = Math.random() > 0.3 ? 1 : 0;

            // 60% chance to have an incoming organic search keyword
            const hasKW = Math.random() > 0.4;
            const kwObj = hasKW ? sampleKeywords[Math.floor(Math.random() * sampleKeywords.length)] : { kw: '', se: '' };

            stmt.run(
                'demo-site-1', sessionId, visitorId, path, titles[path],
                ref.ref, ref.domain, kwObj.kw, kwObj.se, country, city,
                browser, os, device, '1920x1080', duration, isUnique,
                date.toISOString().replace('T', ' ').substring(0, 19)
            );
        }
    }

    initialSites.forEach(s => {
        // Today pageviews
        for (let i = 0; i < s.todayViews; i++) {
            const visitorId = 'v_' + s.id + '_' + (i % s.todayVis);
            const sessionId = 's_' + s.id + '_' + i;
            stmt.run(
                s.id, sessionId, visitorId, '/', 'Home - ' + s.domain,
                'https://google.com', 'google.com', 'ID', 'Jakarta',
                'Chrome', 'Windows', 'desktop', '1920x1080', 35, 1,
                now.toISOString().replace('T', ' ').substring(0, 19)
            );
        }

        // Online heartbeats
        if (s.online > 0) {
            for (let j = 0; j < s.online; j++) {
                db.run(`
                    INSERT OR REPLACE INTO heartbeats (session_id, site_id, path, title, country, city, browser, device, last_ping)
                    VALUES ('hb_${s.id}_${j}', '${s.id}', '/', 'Home', 'ID', 'Jakarta', 'Chrome', 'desktop', datetime('now'))
                `);
            }
        }
    });

    stmt.finalize(() => {
        console.log('✅ Sample data seeded successfully!');
        db.close();
    });
}
