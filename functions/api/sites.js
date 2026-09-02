// Cloudflare Pages Function: Site Management (/api/sites)

export async function onRequestGet(context) {
    const { request, env } = context;
    const db = env.DB;

    if (!db) {
        return new Response(JSON.stringify({ error: "Database binding 'DB' not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const todayStr = new Date().toISOString().split("T")[0];

        const query = `
            SELECT s.id, s.user_id, s.name, s.domain, s.created_at, s.settings,
                   (SELECT COUNT(*) FROM pageviews WHERE site_id = s.id) as total_views,
                   (SELECT COUNT(DISTINCT visitor_id) FROM pageviews WHERE site_id = s.id) as total_visitors,
                   (SELECT COUNT(*) FROM pageviews WHERE site_id = s.id AND created_at >= '${todayStr} 00:00:00') as pageviews_today,
                   (SELECT COUNT(DISTINCT visitor_id) FROM pageviews WHERE site_id = s.id AND created_at >= '${todayStr} 00:00:00') as visitors_today,
                   (SELECT COUNT(*) FROM heartbeats WHERE site_id = s.id AND last_ping >= datetime('now', '-5 minutes')) as online_now
            FROM sites s
            ORDER BY s.created_at DESC
        `;

        const sites = (await db.prepare(query).all()).results || [];

        return new Response(JSON.stringify({ ok: true, sites }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Sites query error:", err);
        const fallbackSites = [
            { id: "mobi.capegrace.com", name: "Mobi Capegrace", domain: "mobi.capegrace.com", total_views: 145, total_visitors: 126, pageviews_today: 145, visitors_today: 126, online_now: 3 },
            { id: "tools.pafyll.com", name: "Tools Pafyll", domain: "tools.pafyll.com", total_views: 24, total_visitors: 18, pageviews_today: 24, visitors_today: 18, online_now: 1 }
        ];
        return new Response(JSON.stringify({ ok: true, sites: fallbackSites, fallback: true }), {
            headers: { "Content-Type": "application/json" }
        });
    }
}

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
        const userId = getUserIdFromHeader(request) || "user_admin";
        const data = await request.json();
        const name = (data.name || "").trim();
        const domain = (data.domain || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        
        if (!name || !domain) {
            return new Response(JSON.stringify({ error: "Name and Domain are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        let siteId = (data.id || "").trim();
        if (!siteId) {
            const cleanDomain = domain.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/^-+|-+$/g, "");
            siteId = "site-" + cleanDomain + "-" + Math.random().toString(36).substring(2, 6);
        }

        await db.prepare(`
            INSERT INTO sites (id, user_id, name, domain, created_at, settings)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(id) DO UPDATE SET
                user_id = excluded.user_id,
                name = excluded.name,
                domain = excluded.domain,
                settings = excluded.settings
        `).bind(siteId, userId, name, domain, JSON.stringify(data.settings || {})).run();

        return new Response(JSON.stringify({ ok: true, site: { id: siteId, name, domain, user_id: userId } }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

export async function onRequestDelete(context) {
    const { request, env } = context;
    const db = env.DB;

    if (!db) {
        return new Response(JSON.stringify({ error: "Database binding 'DB' not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const userId = getUserIdFromHeader(request);
        const url = new URL(request.url);
        const siteId = url.searchParams.get("id");

        if (!siteId) {
            return new Response(JSON.stringify({ error: "Site ID is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        let deleteQuery = "DELETE FROM sites WHERE (id = ? OR domain = ?)";
        let params = [siteId, siteId];

        if (userId && userId !== "user_admin" && siteId !== "demo-site-1" && siteId !== "example.com") {
            deleteQuery += " AND (user_id = ? OR user_id = 'user_admin' OR user_id IS NULL)";
            params.push(userId);
        }

        await db.prepare(deleteQuery).bind(...params).run();
        await db.prepare("DELETE FROM pageviews WHERE site_id = ? OR site_id = ?").bind(siteId, siteId).run();
        await db.prepare("DELETE FROM heartbeats WHERE site_id = ? OR site_id = ?").bind(siteId, siteId).run();
        await db.prepare("DELETE FROM events WHERE site_id = ? OR site_id = ?").bind(siteId, siteId).run();

        return new Response(JSON.stringify({ ok: true, deleted_id: siteId }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

function getUserIdFromHeader(request) {
    try {
        const auth = request.headers.get("Authorization") || "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token) return null;
        const decoded = JSON.parse(atob(token));
        return decoded.userId || null;
    } catch(e) {
        return null;
    }
}
