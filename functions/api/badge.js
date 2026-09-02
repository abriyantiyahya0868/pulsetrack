// Cloudflare Pages Function: Dynamic Histats-Style Counter Badges (/api/badge)

export async function onRequestGet(context) {
    const { request, env } = context;
    const db = env.DB;

    const url = new URL(request.url);
    const siteId = url.searchParams.get("site_id") || "demo-site-1";
    const theme = url.searchParams.get("theme") || "modern"; // modern, classic, neon, minimal
    const type = url.searchParams.get("type") || "all"; // all, online, today, total

    let online = 0;
    let today = 0;
    let total = 0;

    if (db) {
        try {
            // Online visitors in last 5 min
            const onlineRes = await db.prepare(`
                SELECT COUNT(*) as count FROM heartbeats 
                WHERE site_id = ? AND last_ping >= datetime('now', '-5 minutes')
            `).bind(siteId).first();
            online = onlineRes ? onlineRes.count : 0;

            // Today's visitors
            const todayStr = new Date().toISOString().split("T")[0];
            const todayRes = await db.prepare(`
                SELECT COUNT(*) as count FROM pageviews 
                WHERE site_id = ? AND created_at >= ?
            `).bind(siteId, todayStr + " 00:00:00").first();
            today = todayRes ? todayRes.count : 0;

            // Total pageviews
            const totalRes = await db.prepare(`
                SELECT COUNT(*) as count FROM pageviews 
                WHERE site_id = ?
            `).bind(siteId).first();
            total = totalRes ? totalRes.count : 0;
        } catch (e) { }
    }

    // Format numbers with commas or K/M
    const formatNum = (num) => Number(num).toLocaleString();

    let svg = "";

    if (theme === "classic") {
        // Classic Histats Retro Style Badge
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
  
  <!-- Online Row -->
  <circle cx="12" cy="25" r="3.5" fill="#22c55e"/>
  <text x="20" y="28" fill="#94a3b8" font-family="sans-serif" font-size="8.5">Online:</text>
  <text x="120" y="28" fill="#4ade80" font-family="'Courier New', monospace" font-size="9.5" font-weight="bold" text-anchor="end">${formatNum(online)}</text>
  
  <!-- Today Row -->
  <text x="10" y="41" fill="#94a3b8" font-family="sans-serif" font-size="8.5">Today:</text>
  <text x="120" y="41" fill="#f8fafc" font-family="'Courier New', monospace" font-size="9.5" font-weight="bold" text-anchor="end">${formatNum(today)}</text>
  
  <!-- Total Row -->
  <text x="10" y="53" fill="#94a3b8" font-family="sans-serif" font-size="8.5">Total:</text>
  <text x="120" y="53" fill="#38bdf8" font-family="'Courier New', monospace" font-size="9.5" font-weight="bold" text-anchor="end">${formatNum(total)}</text>
</svg>
        `;
    } else if (theme === "neon") {
        // Neon Cyberpunk Badge
        svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="38" viewBox="0 0 160 38">
  <defs>
    <linearGradient id="neonBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="160" height="38" rx="8" fill="url(#neonBg)" stroke="#10b981" stroke-width="1.2"/>
  
  <!-- Live Pulse Dot -->
  <circle cx="15" cy="19" r="4" fill="#10b981" filter="url(#glow)"/>
  <circle cx="15" cy="19" r="2" fill="#ffffff"/>
  
  <text x="26" y="16" fill="#10b981" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="8" font-weight="bold" letter-spacing="1">LIVE USERS</text>
  <text x="26" y="29" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="12" font-weight="bold">${formatNum(online)}</text>
  
  <!-- Divider -->
  <line x1="88" y1="8" x2="88" y2="30" stroke="#334155" stroke-width="1"/>
  
  <text x="96" y="16" fill="#94a3b8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="8" font-weight="bold" letter-spacing="0.5">TODAY</text>
  <text x="96" y="29" fill="#38bdf8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="12" font-weight="bold">${formatNum(today)}</text>
</svg>
        `;
    } else if (theme === "minimal") {
        // Minimalist Compact Badge
        svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="24" viewBox="0 0 120 24">
  <rect width="120" height="24" rx="4" fill="#1e293b"/>
  <rect width="60" height="24" rx="4" fill="#0f172a"/>
  <circle cx="10" cy="12" r="3" fill="#22c55e"/>
  <text x="18" y="15" fill="#94a3b8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="9" font-weight="600">ONLINE</text>
  <text x="90" y="15" fill="#f8fafc" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="10" font-weight="bold" text-anchor="middle">${formatNum(online)}</text>
</svg>
        `;
    } else {
        // Modern Pill Badge (Default)
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
  
  <!-- Live Pulse Dot -->
  <circle cx="16" cy="17" r="4.5" fill="#22c55e"/>
  <circle cx="16" cy="17" r="2" fill="#ffffff"/>
  
  <text x="26" y="21" fill="#818cf8" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="9" font-weight="bold">ONLINE</text>
  <text x="70" y="21" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="11" font-weight="bold">${formatNum(online)}</text>
  
  <circle cx="98" cy="17" r="2" fill="#475569"/>
  
  <text x="108" y="21" fill="#94a3b8" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="9" font-weight="bold">TOTAL</text>
  <text x="144" y="21" fill="#38bdf8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="11" font-weight="bold">${formatNum(total)}</text>
</svg>
        `;
    }

    return new Response(svg.trim(), {
        headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    });
}
