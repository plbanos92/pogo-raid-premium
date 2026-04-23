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

    if (url.pathname === '/api/realtime-config' && request.method === 'GET') {
      const auth = request.headers.get('Authorization');
      if (!auth || !auth.startsWith('Bearer ')) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return Response.json(
        { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY },
        {
          headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        }
      );
    }

    if (url.pathname === '/api/vapid-key' && request.method === 'GET') {
      const auth = request.headers.get('Authorization');
      if (!auth || !auth.startsWith('Bearer ')) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!env.VAPID_PUBLIC_KEY) {
        return Response.json({ error: 'Server not configured' }, { status: 500 });
      }
      return Response.json(
        { key: env.VAPID_PUBLIC_KEY },
        {
          headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        }
      );
    }

    // ─── Analytics beacon ────────────────────────────────────────
    // POST /api/track — same-origin beacon from the client that enriches the
    // payload with Cloudflare geo data and a salted SHA-256 hash of the caller's
    // IP (raw IP is NEVER stored). No auth required — the Supabase RLS policy
    // on `page_views` allows anon INSERT, and a BEFORE INSERT trigger assigns
    // user_id from auth.uid() when the caller is logged in.
    if (url.pathname === '/api/track' && request.method === 'POST') {
      try {
        const raw = await request.text();
        if (raw.length > 8192) {
          return new Response('payload too large', { status: 413 });
        }
        let payload;
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          return new Response('bad json', { status: 400 });
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return new Response('bad payload', { status: 400 });
        }

        // Hash the caller's IP (salted) so we never store raw IPs.
        const ip = request.headers.get('CF-Connecting-IP') || '';
        const salt = env.ANALYTICS_IP_SALT || 'raidsync-analytics-v1';
        let ipHash = null;
        if (ip) {
          const digest = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(ip + '|' + salt)
          );
          const bytes = new Uint8Array(digest);
          ipHash = '';
          for (let i = 0; i < bytes.length; i++) {
            ipHash += bytes[i].toString(16).padStart(2, '0');
          }
        }

        // Cloudflare-injected geo/network data (free on every request).
        const cf = request.cf || {};

        // Whitelist + truncate user-supplied fields to defend against abuse.
        const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
        const i = (v) => {
          const n = parseInt(v, 10);
          return Number.isFinite(n) ? n : null;
        };
        const f = (v) => {
          const n = typeof v === 'number' ? v : parseFloat(v);
          return Number.isFinite(n) ? n : null;
        };
        const b = (v) => (typeof v === 'boolean' ? v : null);

        const row = {
          visitor_id:       s(payload.visitor_id, 64),
          session_id:       s(payload.session_id, 64),
          event_type:       s(payload.event_type, 32) || 'pageview',
          path:             s(payload.path, 512),
          view_name:        s(payload.view_name, 64),
          referrer:         s(payload.referrer, 2048),
          referrer_host:    s(payload.referrer_host, 255),
          user_agent:       s(payload.user_agent, 512),
          browser:          s(payload.browser, 64),
          browser_version:  s(payload.browser_version, 32),
          os:               s(payload.os, 64),
          os_version:       s(payload.os_version, 32),
          device_type:      s(payload.device_type, 16),
          language:         s(payload.language, 16),
          languages:        s(payload.languages, 255),
          timezone:         s(payload.timezone, 64),
          timezone_offset:  i(payload.timezone_offset),
          screen_w:         i(payload.screen_w),
          screen_h:         i(payload.screen_h),
          viewport_w:       i(payload.viewport_w),
          viewport_h:       i(payload.viewport_h),
          dpr:              f(payload.dpr),
          color_depth:      i(payload.color_depth),
          is_standalone:    b(payload.is_standalone),
          is_touch:         b(payload.is_touch),
          prefers_dark:     b(payload.prefers_dark),
          connection_type:  s(payload.connection_type, 32),
          effective_type:   s(payload.effective_type, 16),
          downlink:         f(payload.downlink),
          hardware_concurrency: i(payload.hardware_concurrency),
          device_memory:    f(payload.device_memory),
          platform:         s(payload.platform, 64),
          vendor:           s(payload.vendor, 64),
          // Server-side enrichment
          ip_hash:          ipHash,
          country:          s(cf.country, 2),
          region:           s(cf.region, 64),
          city:             s(cf.city, 64),
          continent:        s(cf.continent, 2),
          colo:             s(cf.colo, 8),
          asn:              typeof cf.asn === 'number' ? cf.asn : i(cf.asn),
          as_organization:  s(cf.asOrganization, 128),
          extra:            payload.extra && typeof payload.extra === 'object' ? payload.extra : null,
        };

        // Forward the JWT if present so the INSERT trigger can capture user_id.
        const headers = new Headers();
        headers.set('apikey', env.SUPABASE_ANON_KEY);
        headers.set('Content-Type', 'application/json');
        headers.set('Prefer', 'return=minimal');
        const incomingAuth = request.headers.get('Authorization');
        if (incomingAuth) headers.set('Authorization', incomingAuth);
        else headers.set('Authorization', 'Bearer ' + env.SUPABASE_ANON_KEY);

        const resp = await fetch(env.SUPABASE_URL + '/rest/v1/page_views', {
          method: 'POST',
          headers,
          body: JSON.stringify(row),
        });

        if (!resp.ok) {
          const body = await resp.text();
          console.warn('[Worker] /api/track insert failed:', resp.status, body.slice(0, 200));
          return new Response('', { status: resp.status });
        }
        return new Response('', { status: 204 });
      } catch (err) {
        console.error('[Worker] /api/track error:', err && err.message);
        return new Response('', { status: 204 }); // never let tracking errors break the page
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
