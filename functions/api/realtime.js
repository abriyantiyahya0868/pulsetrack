// Cloudflare Pages Function: Realtime Traffic Stream (/api/realtime)

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
        const url = new URL(request.url);
        const siteId = url.searchParams.get("site_id") || "demo-site-1";

        // Active visitors in last 3 minutes
        const activeVisitorsQuery = `
            SELECT session_id, path, title, country, city, browser, device, last_ping
            FROM heartbeats
            WHERE site_id = ? AND last_ping >= datetime('now', '-3 minutes')
            ORDER BY last_ping DESC
        `;
        const activeList = (await db.prepare(activeVisitorsQuery).bind(siteId).all()).results || [];

        // Breakdown of current active pages
        const activePagesQuery = `
            SELECT path, COUNT(*) as active_count
            FROM heartbeats
            WHERE site_id = ? AND last_ping >= datetime('now', '-3 minutes')
            GROUP BY path
            ORDER BY active_count DESC
            LIMIT 10
        `;
        const activePages = (await db.prepare(activePagesQuery).bind(siteId).all()).results || [];

        return new Response(JSON.stringify({
            ok: true,
            site_id: siteId,
            online_count: activeList.length,
            active_visitors: activeList,
            active_pages: activePages,
            timestamp: new Date().toISOString()
        }), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate"
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
