// Cloudflare Pages Function: Ingestion Collector (/api/collect)

export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB;

    if (!db) {
        return new Response(JSON.stringify({ error: "Database binding 'DB' not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const data = await request.json();
        const siteId = data.site_id || "default";
        const sessionId = data.session_id || "unknown";
        const visitorId = data.visitor_id || "unknown";
        const type = data.type || "pageview";

        // Extract Geo and IP info from Cloudflare Request Headers
        const country = request.headers.get("cf-ipcountry") || data.country || "XX";
        const city = request.headers.get("cf-ipcity") || data.city || "";
        const clientIp = request.headers.get("cf-connecting-ip") || "0.0.0.0";
        const userAgent = request.headers.get("user-agent") || "";

        // Helper to extract domain from referrer
        let referrerDomain = "Direct / None";
        if (data.referrer) {
            try {
                const url = new URL(data.referrer);
                referrerDomain = url.hostname.replace(/^www\./, "");
            } catch (e) {
                referrerDomain = "Direct / None";
            }
        }

        // Auto-register site if not exists
        try {
            const domainName = siteId.includes('.') ? siteId : (data.domain || referrerDomain || siteId);
            await db.prepare(`
                INSERT OR IGNORE INTO sites (id, name, domain, created_at, settings)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, '{}')
            `).bind(siteId, domainName, domainName).run();
        } catch(e) {}

        if (type === "pageview") {
            const path = data.path || "/";
            const title = data.title || "";
            const referrer = data.referrer || "";
            const keyword = (data.keyword || "").trim();
            const searchEngine = (data.search_engine || "").trim();
            const browser = data.browser || "Unknown";
            const os = data.os || "Unknown";
            const device = data.device || "desktop";
            const screen = data.screen || "";
            const utmSource = data.utm_source || "";
            const utmMedium = data.utm_medium || "";
            const utmCampaign = data.utm_campaign || "";
            const utmTerm = data.utm_term || "";

            // Check if visitor is unique for today
            const todayStr = new Date().toISOString().split("T")[0];
            const checkUnique = await db.prepare(`
                SELECT COUNT(*) as count FROM pageviews 
                WHERE site_id = ? AND visitor_id = ? AND created_at >= ?
            `).bind(siteId, visitorId, todayStr + " 00:00:00").first();

            const isUnique = (checkUnique && checkUnique.count > 0) ? 0 : 1;

            // Insert pageview
            await db.prepare(`
                INSERT INTO pageviews (
                    site_id, session_id, visitor_id, path, title,
                    referrer, referrer_domain, keyword, search_engine,
                    country, city, browser, os, device, screen,
                    utm_source, utm_medium, utm_campaign, utm_term, is_unique
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                siteId, sessionId, visitorId, path, title,
                referrer, referrerDomain, keyword, searchEngine,
                country, city, browser, os, device, screen,
                utmSource, utmMedium, utmCampaign, utmTerm, isUnique
            ).run();

            // Update heartbeat/realtime active visitor
            await db.prepare(`
                INSERT INTO heartbeats (session_id, site_id, path, title, country, city, browser, device, last_ping)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(session_id) DO UPDATE SET
                    path = excluded.path,
                    title = excluded.title,
                    last_ping = CURRENT_TIMESTAMP
            `).bind(sessionId, siteId, path, title, country, city, browser, device).run();

            return new Response(JSON.stringify({ ok: true, status: "pageview_recorded" }), {
                headers: { "Content-Type": "application/json" }
            });

        } else if (type === "heartbeat") {
            const path = data.path || "/";
            const title = data.title || "";
            const duration = parseInt(data.duration || 0, 10);
            const browser = data.browser || "Unknown";
            const device = data.device || "desktop";

            // Update heartbeat ping
            await db.prepare(`
                INSERT INTO heartbeats (session_id, site_id, path, title, country, city, browser, device, last_ping)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(session_id) DO UPDATE SET
                    path = excluded.path,
                    title = excluded.title,
                    last_ping = CURRENT_TIMESTAMP
            `).bind(sessionId, siteId, path, title, country, city, browser, device).run();

            // Update duration in latest pageview for this session
            if (duration > 0) {
                await db.prepare(`
                    UPDATE pageviews 
                    SET duration = ? 
                    WHERE id = (
                        SELECT id FROM pageviews 
                        WHERE session_id = ? AND site_id = ? 
                        ORDER BY id DESC LIMIT 1
                    )
                `).bind(duration, sessionId, siteId).run();
            }

            return new Response(JSON.stringify({ ok: true, status: "heartbeat_updated" }), {
                headers: { "Content-Type": "application/json" }
            });

        } else if (type === "event") {
            const eventName = data.event_name || "custom";
            const eventData = data.event_data || "{}";
            const path = data.path || "/";

            await db.prepare(`
                INSERT INTO events (site_id, session_id, event_name, event_data, path)
                VALUES (?, ?, ?, ?, ?)
            `).bind(siteId, sessionId, eventName, eventData, path).run();

            return new Response(JSON.stringify({ ok: true, status: "event_recorded" }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ error: "Invalid type" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
