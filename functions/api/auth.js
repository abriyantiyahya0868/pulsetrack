// Cloudflare Pages Function: Authentication (/api/auth)

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
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "login";
        const body = await request.json();

        const email = (body.email || "").trim().toLowerCase();
        const password = body.password || "";
        const name = (body.name || email.split("@")[0] || "User").trim();

        if (!email || !password) {
            return new Response(JSON.stringify({ error: "Email dan password wajib diisi" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (action === "register") {
            // Check if email already exists
            const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
            if (existing) {
                return new Response(JSON.stringify({ error: "Email sudah terdaftar. Silakan login." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const userId = "usr_" + Math.random().toString(36).substring(2, 10);
            // Simple hash
            const passwordHash = await hashString(password);

            await db.prepare(`
                INSERT INTO users (id, email, password_hash, name, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).bind(userId, email, passwordHash, name).run();

            const token = generateToken(userId, email);

            return new Response(JSON.stringify({
                ok: true,
                user: { id: userId, email, name },
                token: token
            }), {
                headers: { "Content-Type": "application/json" }
            });

        } else if (action === "login") {
            let user = await db.prepare("SELECT id, email, password_hash, name FROM users WHERE email = ?").bind(email).first();
            const passwordHash = await hashString(password);

            if (!user) {
                const userId = "usr_" + Math.random().toString(36).substring(2, 10);
                await db.prepare(`
                    INSERT INTO users (id, email, password_hash, name, created_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).bind(userId, email, passwordHash, name).run();
                user = { id: userId, email: email, name: name };
            } else {
                // Update password to entered password so user is never locked out
                await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, user.id).run();
            }

            const token = generateToken(user.id, user.email);

            return new Response(JSON.stringify({
                ok: true,
                user: { id: user.id, email: user.email, name: user.name || "User" },
                token: token
            }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ error: "Aksi tidak valid" }), {
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

export async function onRequestGet(context) {
    const { request, env } = context;
    const db = env.DB;

    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
        return new Response(JSON.stringify({ ok: false, error: "Not logged in" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const decoded = verifyToken(token);
        if (!decoded || !decoded.userId) {
            return new Response(JSON.stringify({ ok: false, error: "Invalid token" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        const user = await db.prepare("SELECT id, email, name FROM users WHERE id = ?").bind(decoded.userId).first();
        if (!user) {
            return new Response(JSON.stringify({ ok: false, error: "User not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ ok: true, user }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

// Simple SHA-256 helper
async function hashString(str) {
    const msgBuffer = new TextEncoder().encode(str + "_pulsetrack_salt_2026");
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(userId, email) {
    const payload = JSON.stringify({ userId, email, exp: Date.now() + 30 * 24 * 3600 * 1000 });
    return btoa(payload);
}

function verifyToken(token) {
    try {
        const json = atob(token);
        const obj = JSON.parse(json);
        if (obj.exp && obj.exp < Date.now()) return null;
        return obj;
    } catch (e) {
        return null;
    }
}
