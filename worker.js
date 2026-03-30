export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only proxy /api/* requests; everything else → static assets
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      console.error('[Worker] Missing SUPABASE_URL or SUPABASE_ANON_KEY — check Worker secrets');
      return Response.json(
        { error: 'Server not configured' },
        { status: 500 }
      );
    }

    // CSRF: reject cross-origin mutation requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) {
        console.warn(`[Worker] CSRF rejected — origin: ${origin}`);
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Strip /api prefix → Supabase path  (/api/auth/v1/... → /auth/v1/...)
    const supabasePath = url.pathname.slice(4);

    // Allow only Supabase auth and REST paths to prevent SSRF
    if (!supabasePath.startsWith('/auth/v1/') && !supabasePath.startsWith('/rest/v1/')) {
      console.warn(`[Worker] SSRF blocked — disallowed path: ${supabasePath}`);
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Build target URL (never expose SUPABASE_URL to the client)
    const target = env.SUPABASE_URL + supabasePath + url.search;
    console.log(`[Worker] ${request.method} ${url.pathname}${url.search ? url.search.slice(0, 80) : ''}`);

    // Forward only the headers Supabase needs
    const headers = new Headers();
    headers.set('apikey', env.SUPABASE_ANON_KEY);
    headers.set('Content-Type', 'application/json');

    const auth = request.headers.get('Authorization');
    if (auth) headers.set('Authorization', auth);

    const prefer = request.headers.get('Prefer');
    if (prefer) headers.set('Prefer', prefer);

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    });

    console.log(`[Worker] ← ${response.status} ${response.statusText} (${supabasePath})`);

    // Return response with security headers
    const resHeaders = new Headers();
    resHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/json');
    resHeaders.set('Cache-Control', 'no-store');
    resHeaders.set('X-Content-Type-Options', 'nosniff');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders,
    });
  },
};
