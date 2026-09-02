-- PulseTrack Database Schema for Cloudflare D1 & SQLite

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'user_admin',
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settings TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS pageviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    path TEXT NOT NULL,
    title TEXT,
    referrer TEXT,
    referrer_domain TEXT,
    keyword TEXT DEFAULT '',
    search_engine TEXT DEFAULT '',
    country TEXT DEFAULT 'XX',
    city TEXT DEFAULT '',
    browser TEXT DEFAULT 'Unknown',
    os TEXT DEFAULT 'Unknown',
    device TEXT DEFAULT 'desktop',
    screen TEXT DEFAULT '',
    utm_source TEXT DEFAULT '',
    utm_medium TEXT DEFAULT '',
    utm_campaign TEXT DEFAULT '',
    utm_term TEXT DEFAULT '',
    duration INTEGER DEFAULT 0,
    is_unique INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    event_data TEXT DEFAULT '{}',
    path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS heartbeats (
    session_id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    path TEXT NOT NULL,
    title TEXT,
    country TEXT DEFAULT 'XX',
    city TEXT DEFAULT '',
    browser TEXT DEFAULT 'Unknown',
    device TEXT DEFAULT 'desktop',
    last_ping DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for Lightning Fast Querying
CREATE INDEX IF NOT EXISTS idx_pageviews_site_date ON pageviews(site_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_site_path ON pageviews(site_id, path);
CREATE INDEX IF NOT EXISTS idx_pageviews_visitor ON pageviews(site_id, visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_country ON pageviews(site_id, country);
CREATE INDEX IF NOT EXISTS idx_pageviews_referrer ON pageviews(site_id, referrer_domain);
CREATE INDEX IF NOT EXISTS idx_heartbeats_ping ON heartbeats(site_id, last_ping);
CREATE INDEX IF NOT EXISTS idx_events_site_date ON events(site_id, created_at);

-- Insert Default Demo Site
INSERT OR IGNORE INTO sites (id, name, domain, created_at, settings) 
VALUES ('demo-site-1', 'My Awesome Website', 'example.com', CURRENT_TIMESTAMP, '{"public":true,"theme":"dark"}');
