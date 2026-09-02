// Cloudflare Pages Function: Analytics Statistics & Breakdown (/api/stats)

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
        const siteId = url.searchParams.get("site_id") || "all";
        const period = url.searchParams.get("period") || "7d";
        const startDate = url.searchParams.get("start");
        const endDate = url.searchParams.get("end");

        let dateCondition = "";
        let params = [];
        const now = new Date();
        const formatDate = (d) => d.toISOString().split("T")[0];

        // Site condition
        let siteCondition = "";
        if (siteId && siteId !== "all") {
            siteCondition = "AND p.site_id = ?";
            params.push(siteId);
        }

        if (period === "today") {
            dateCondition = "AND p.created_at >= ?";
            params.push(formatDate(now) + " 00:00:00");
        } else if (period === "yesterday") {
            const yest = new Date(now);
            yest.setDate(yest.getDate() - 1);
            const yestStr = formatDate(yest);
            dateCondition = "AND p.created_at >= ? AND p.created_at <= ?";
            params.push(yestStr + " 00:00:00", yestStr + " 23:59:59");
        } else if (period === "7d") {
            const d7 = new Date(now);
            d7.setDate(d7.getDate() - 7);
            dateCondition = "AND p.created_at >= ?";
            params.push(formatDate(d7) + " 00:00:00");
        } else if (period === "30d") {
            const d30 = new Date(now);
            d30.setDate(d30.getDate() - 30);
            dateCondition = "AND p.created_at >= ?";
            params.push(formatDate(d30) + " 00:00:00");
        } else if (period === "custom" && startDate && endDate) {
            dateCondition = "AND p.created_at >= ? AND p.created_at <= ?";
            params.push(startDate + " 00:00:00", endDate + " 23:59:59");
        }

        // 1. Overview Summary
        const summaryQuery = `
            SELECT 
                COUNT(*) as total_pageviews,
                COUNT(DISTINCT p.visitor_id) as unique_visitors,
                COUNT(DISTINCT p.session_id) as total_sessions,
                AVG(p.duration) as avg_duration,
                SUM(CASE WHEN p.duration < 5 THEN 1 ELSE 0 END) * 100.0 / MAX(COUNT(*), 1) as bounce_rate
            FROM pageviews p
            WHERE 1=1 ${siteCondition} ${dateCondition}
        `;
        const summary = (await db.prepare(summaryQuery).bind(...params).first()) || {};

        // 2. Realtime active visitors
        let onlineParams = [];
        let hbSiteCondition = "";
        if (siteId && siteId !== "all") {
            hbSiteCondition = "AND site_id = ?";
            onlineParams.push(siteId);
        }
        const onlineQuery = `
            SELECT COUNT(*) as online_count 
            FROM heartbeats 
            WHERE last_ping >= datetime('now', '-5 minutes') ${hbSiteCondition}
        `;
        const onlineRes = await db.prepare(onlineQuery).bind(...onlineParams).first();
        const onlineCount = onlineRes ? onlineRes.online_count : 0;

        // 3. Time Series Chart Data
        const isHourly = period === "today" || period === "yesterday";
        const groupFormat = isHourly ? "%Y-%m-%d %H:00" : "%Y-%m-%d";
        const chartQuery = `
            SELECT 
                strftime('${groupFormat}', p.created_at) as time_bucket,
                COUNT(*) as pageviews,
                COUNT(DISTINCT p.visitor_id) as visitors
            FROM pageviews p
            WHERE 1=1 ${siteCondition} ${dateCondition}
            GROUP BY time_bucket
            ORDER BY time_bucket ASC
        `;
        const chartData = (await db.prepare(chartQuery).bind(...params).all()).results || [];

        // 4. TOP 100 URLs Teratas
        const pageQuery = `
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
        `;
        const topPages = (await db.prepare(pageQuery).bind(...params).all()).results || [];

        // 5. TOP 100 Keywords Teratas
        const keywordQuery = `
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
        `;
        const topKeywords = (await db.prepare(keywordQuery).bind(...params).all()).results || [];

        // 6. TOP Domains Teratas (Peringkat Domain)
        const domainQuery = `
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
        `;
        const topDomains = (await db.prepare(domainQuery).bind(...params).all()).results || [];

        // 7. Top Referrers
        const referrerQuery = `
            SELECT p.referrer_domain as domain, COUNT(*) as count
            FROM pageviews p
            WHERE 1=1 ${siteCondition} ${dateCondition}
            GROUP BY p.referrer_domain
            ORDER BY count DESC
            LIMIT 15
        `;
        const topReferrers = (await db.prepare(referrerQuery).bind(...params).all()).results || [];

        // 8. Top Countries
        const countryQuery = `
            SELECT 
                p.country,
                COUNT(*) as count
            FROM pageviews p
            WHERE 1=1 ${siteCondition} ${dateCondition}
            GROUP BY p.country
            ORDER BY count DESC
            LIMIT 15
        `;
        const topCountries = (await db.prepare(countryQuery).bind(...params).all()).results || [];

        // 9. Search Engines Breakdown
        const searchEngineQuery = `
            SELECT 
                COALESCE(NULLIF(p.search_engine, ''), 'Google') as name,
                COUNT(*) as count
            FROM pageviews p
            WHERE (p.search_engine != '' OR p.referrer_domain LIKE '%google%' OR p.referrer_domain LIKE '%bing%' OR p.referrer_domain LIKE '%yahoo%') ${siteCondition} ${dateCondition}
            GROUP BY name
            ORDER BY count DESC
        `;
        const searchEngines = (await db.prepare(searchEngineQuery).bind(...params).all()).results || [];

        // 10. Devices, Browsers, OS
        const deviceQuery = `SELECT p.device as name, COUNT(*) as count FROM pageviews p WHERE 1=1 ${siteCondition} ${dateCondition} GROUP BY p.device ORDER BY count DESC`;
        const browserQuery = `SELECT p.browser as name, COUNT(*) as count FROM pageviews p WHERE 1=1 ${siteCondition} ${dateCondition} GROUP BY p.browser ORDER BY count DESC LIMIT 6`;
        const osQuery = `SELECT p.os as name, COUNT(*) as count FROM pageviews p WHERE 1=1 ${siteCondition} ${dateCondition} GROUP BY p.os ORDER BY count DESC LIMIT 6`;

        const devices = (await db.prepare(deviceQuery).bind(...params).all()).results || [];
        const browsers = (await db.prepare(browserQuery).bind(...params).all()).results || [];
        const os = (await db.prepare(osQuery).bind(...params).all()).results || [];

        // 11. Live Recent Feed
        const feedQuery = `
            SELECT 
                p.visitor_id, p.session_id, p.path, p.title, COALESCE(s.domain, p.site_id) as domain, p.referrer_domain, p.keyword, p.search_engine, p.country, p.city, p.browser, p.os, p.device, p.created_at 
            FROM pageviews p
            LEFT JOIN sites s ON p.site_id = s.id
            WHERE 1=1 ${siteCondition}
            ORDER BY p.id DESC
            LIMIT 25
        `;
        const recentLog = (await db.prepare(feedQuery).bind(...onlineParams).all()).results || [];

        // 12. Most Active Visitors
        const activeVisitorsQuery = `
            SELECT 
                p.visitor_id, p.country, p.city, p.browser, p.os, p.device, 
                COUNT(*) as hits, 
                MAX(p.title) as last_title, 
                MAX(p.path) as last_path, 
                MAX(p.created_at) as last_seen
            FROM pageviews p
            WHERE 1=1 ${siteCondition}
            GROUP BY p.visitor_id
            ORDER BY hits DESC
            LIMIT 10
        `;
        const activeVisitors = (await db.prepare(activeVisitorsQuery).bind(...onlineParams).all()).results || [];

        return new Response(JSON.stringify({
            ok: true,
            site_id: siteId,
            period: period,
            summary: {
                total_pageviews: summary.total_pageviews || 0,
                unique_visitors: summary.unique_visitors || 0,
                total_sessions: summary.total_sessions || 0,
                avg_duration: Math.round(summary.avg_duration || 0),
                bounce_rate: Math.round(summary.bounce_rate || 0),
                online_now: onlineCount
            },
            chart: chartData,
            pages: topPages,
            keywords: topKeywords,
            search_engines: searchEngines,
            referrers: topReferrers,
            countries: topCountries,
            devices: devices,
            browsers: browsers,
            os: os,
            recent: recentLog,
            active_visitors: activeVisitors
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
