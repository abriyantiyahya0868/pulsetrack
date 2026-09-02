// CORS & Common Middleware for Cloudflare Pages Functions
export async function onRequest(context) {
    const { request, next } = context;

    // Handle CORS Preflight OPTIONS
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
                "Access-Control-Max-Age": "86400",
            },
        });
    }

    // Execute next handler
    const response = await next();

    // Attach CORS headers to every response
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    newHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}
