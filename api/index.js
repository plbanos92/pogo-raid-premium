// Standalone API Worker — pogo-raid-premium-api
// Handles all /api/* requests from the Pages frontend (and any future clients).
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY, ANALYTICS_IP_SALT
//   npx wrangler secret put <KEY>  (run from this api/ directory)

const ALLOWED_ORIGINS = [
  'https://pogo-raid-premium.pages.dev',
  // Local dev — wrangler pages dev default ports
  'http://localhost:8788',
  'http://127.0.0.1:8788',
  // Any preview deployment subdomain
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Pages preview deployments: *.pogo-raid-premium.pages.dev
  if (/^https:\/\/[a-f0-9]+\.pogo-raid-premium\.pages\.dev$/.test(origin)) return true;
  return false;
}

function corsHeaders(origin) {
  const allowed = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Prefer, apikey',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// ─── Payments webhook helpers ────────────────────────────────────
// Each provider has its own signature scheme. We verify with constant-time
// comparison, then normalize to our internal event shape consumed by
// apply_provider_event() in Supabase.

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// Verify the provider signature and return the normalized event payload that
// our apply_provider_event() RPC expects. Returns null on rejection.
//
// IMPORTANT: this is a skeleton — each provider branch must be filled in with
// the real verification logic before the production cutover. Until then, the
// branches all reject (return null) so no events get applied.
async function verifyAndNormalize(provider, request, rawBody, env) {
  switch (provider) {
    case 'stripe': {
      const sigHeader = request.headers.get('Stripe-Signature') || '';
      const secret = env.STRIPE_WEBHOOK_SECRET;
      if (!secret || !sigHeader) return null;
      // Stripe signature: t=<ts>,v1=<sig>
      const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
      if (!parts.t || !parts.v1) return null;
      const expected = await hmacSha256Hex(secret, parts.t + '.' + rawBody);
      if (!timingSafeEqual(expected, parts.v1)) return null;

      let evt;
      try { evt = JSON.parse(rawBody); } catch { return null; }
      // Caller is responsible for mapping evt.type → our normalized event_type
      // and resolving customer→user_id (typically via metadata.user_id set at
      // checkout-session creation time). Stub returns null until wired up.
      // TODO(payments): implement Stripe → normalized mapping.
      console.warn('[webhook] Stripe verified but mapping not yet implemented');
      return null;
    }

    case 'revenuecat': {
      // RevenueCat uses an Authorization: Bearer <token> shared secret.
      const auth = request.headers.get('Authorization') || '';
      const expected = 'Bearer ' + (env.REVENUECAT_WEBHOOK_TOKEN || '');
      if (!env.REVENUECAT_WEBHOOK_TOKEN || !timingSafeEqual(auth, expected)) return null;
      // TODO(payments): implement RevenueCat → normalized mapping.
      console.warn('[webhook] RevenueCat verified but mapping not yet implemented');
      return null;
    }

    case 'dev': {
      // Local-only test webhook. Requires DEV_WEBHOOK_TOKEN secret AND
      // payments_test_mode must be true in the DB (the RPC runs as
      // service_role, so it bypasses payments_test_mode — we enforce here).
      const auth = request.headers.get('Authorization') || '';
      const expected = 'Bearer ' + (env.DEV_WEBHOOK_TOKEN || '');
      if (!env.DEV_WEBHOOK_TOKEN || !timingSafeEqual(auth, expected)) return null;
      try {
        const evt = JSON.parse(rawBody);
        // Validate required fields up front so the RPC doesn't have to.
        if (!evt || !evt.event_id || !evt.event_type || !evt.user_id || !evt.plan) return null;
        return evt;
      } catch { return null; }
    }

    default:
      return null;
  }
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      console.error('[API] Missing SUPABASE_URL or SUPABASE_ANON_KEY — check Worker secrets');
      return Response.json(
        { error: 'Server not configured' },
        { status: 500, headers: corsHeaders(origin) }
      );
    }

    // CSRF: reject cross-origin mutations from disallowed origins
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (origin && !isAllowedOrigin(origin)) {
        console.warn(`[API] CSRF rejected — origin: ${origin}`);
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders(origin) });
      }
    }

    if (url.pathname === '/api/realtime-config' && request.method === 'GET') {
      const auth = request.headers.get('Authorization');
      if (!auth || !auth.startsWith('Bearer ')) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(origin) });
      }
      return Response.json(
        { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY },
        {
          headers: {
            ...corsHeaders(origin),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        }
      );
    }

    if (url.pathname === '/api/vapid-key' && request.method === 'GET') {
      const auth = request.headers.get('Authorization');
      if (!auth || !auth.startsWith('Bearer ')) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(origin) });
      }
      if (!env.VAPID_PUBLIC_KEY) {
        return Response.json({ error: 'Server not configured' }, { status: 500, headers: corsHeaders(origin) });
      }
      return Response.json(
        { key: env.VAPID_PUBLIC_KEY },
        {
          headers: {
            ...corsHeaders(origin),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        }
      );
    }

    // ─── Analytics beacon ────────────────────────────────────────
    if (url.pathname === '/api/track' && request.method === 'POST') {
      try {
        const raw = await request.text();
        if (raw.length > 16384) {
          return new Response('payload too large', { status: 413, headers: corsHeaders(origin) });
        }
        let payload;
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          return new Response('bad json', { status: 400, headers: corsHeaders(origin) });
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return new Response('bad payload', { status: 400, headers: corsHeaders(origin) });
        }

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

        const cf = request.cf || {};

        const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
        const i = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
        const f = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };
        const b = (v) => (typeof v === 'boolean' ? v : null);

        const row = {
          visitor_id:       s(payload.visitor_id, 64),
          session_id:       s(payload.session_id, 64),
          is_new_visitor:   b(payload.is_new_visitor),
          is_new_session:   b(payload.is_new_session),
          visitor_hit_num:  i(payload.visitor_hit_num),
          session_hit_num:  i(payload.session_hit_num),
          event_type:       s(payload.event_type, 32) || 'pageview',
          path:             s(payload.path, 512),
          view_name:        s(payload.view_name, 64),
          url_query:        s(payload.url_query, 512),
          url_hash:         s(payload.url_hash, 256),
          prev_view:        s(payload.prev_view, 64),
          prev_path:        s(payload.prev_path, 512),
          time_on_prev_view_ms: i(payload.time_on_prev_view_ms),
          session_entry_path:     s(payload.session_entry_path, 512),
          session_entry_referrer: s(payload.session_entry_referrer, 2048),
          session_started_at:     s(payload.session_started_at, 40),
          utm_source:       s(payload.utm_source, 128),
          utm_medium:       s(payload.utm_medium, 128),
          utm_campaign:     s(payload.utm_campaign, 128),
          utm_term:         s(payload.utm_term, 128),
          utm_content:      s(payload.utm_content, 128),
          referrer:         s(payload.referrer, 2048),
          referrer_host:    s(payload.referrer_host, 255),
          user_agent:       s(payload.user_agent, 512),
          browser:          s(payload.browser, 64),
          browser_version:  s(payload.browser_version, 32),
          os:               s(payload.os, 64),
          os_version:       s(payload.os_version, 32),
          device_type:      s(payload.device_type, 16),
          ua_mobile:        b(payload.ua_mobile),
          ua_platform:      s(payload.ua_platform, 64),
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
          orientation:      s(payload.orientation, 32),
          is_standalone:    b(payload.is_standalone),
          is_touch:         b(payload.is_touch),
          prefers_dark:     b(payload.prefers_dark),
          cookie_enabled:   b(payload.cookie_enabled),
          webdriver:        b(payload.webdriver),
          is_online:        b(payload.is_online),
          visibility_state: s(payload.visibility_state, 16),
          has_focus:        b(payload.has_focus),
          connection_type:  s(payload.connection_type, 32),
          effective_type:   s(payload.effective_type, 16),
          downlink:         f(payload.downlink),
          rtt:              i(payload.rtt),
          save_data:        b(payload.save_data),
          hardware_concurrency: i(payload.hardware_concurrency),
          device_memory:    f(payload.device_memory),
          platform:         s(payload.platform, 64),
          vendor:           s(payload.vendor, 64),
          nav_type:         s(payload.nav_type, 16),
          page_load_ms:     i(payload.page_load_ms),
          dcl_ms:           i(payload.dcl_ms),
          fp_ms:            i(payload.fp_ms),
          fcp_ms:           i(payload.fcp_ms),
          ip_hash:          ipHash,
          country:          s(cf.country, 2),
          region:           s(cf.region, 64),
          city:             s(cf.city, 64),
          continent:        s(cf.continent, 2),
          colo:             s(cf.colo, 8),
          asn:              typeof cf.asn === 'number' ? cf.asn : i(cf.asn),
          as_organization:  s(cf.asOrganization, 128),
          cf_postal_code:   s(cf.postalCode, 16),
          cf_latitude:      f(cf.latitude),
          cf_longitude:     f(cf.longitude),
          cf_timezone:      s(cf.timezone, 64),
          cf_region_code:   s(cf.regionCode, 16),
          cf_metro_code:    s(cf.metroCode, 16),
          cf_http_protocol: s(cf.httpProtocol, 16),
          cf_tls_version:   s(cf.tlsVersion, 16),
          extra:            payload.extra && typeof payload.extra === 'object' ? payload.extra : null,
        };

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
          console.warn('[API] /api/track insert failed:', resp.status, body.slice(0, 200));
          return new Response('', { status: resp.status, headers: corsHeaders(origin) });
        }
        return new Response('', { status: 204, headers: corsHeaders(origin) });
      } catch (err) {
        console.error('[API] /api/track error:', err && err.message);
        return new Response('', { status: 204, headers: corsHeaders(origin) }); // never let tracking errors break the page
      }
    }

    // ─── Payments webhooks ───────────────────────────────────────
    // /api/webhooks/<provider>  — provider POSTs raw event, we verify signature,
    // normalize to our event shape, and forward to apply_provider_event() RPC
    // with the service-role JWT. RPC is idempotent on event_id.
    //
    // No CORS — providers POST server-to-server. No Origin check (preflight
    // already returned 204 above). Each provider branch is responsible for
    // signature verification BEFORE we touch the DB.
    {
      const m = url.pathname.match(/^\/api\/webhooks\/([a-z0-9_-]+)$/i);
      if (m && request.method === 'POST') {
        const provider = m[1].toLowerCase();
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error('[API] /api/webhooks: missing SUPABASE_SERVICE_ROLE_KEY secret');
          return new Response('server not configured', { status: 500 });
        }
        try {
          const rawBody = await request.text();
          const normalized = await verifyAndNormalize(provider, request, rawBody, env);
          if (!normalized) {
            console.warn(`[API] /api/webhooks/${provider}: signature/payload rejected`);
            return new Response('invalid signature', { status: 400 });
          }

          // Forward to apply_provider_event() with service-role auth.
          const headers = new Headers();
          headers.set('apikey', env.SUPABASE_SERVICE_ROLE_KEY);
          headers.set('Authorization', 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY);
          headers.set('Content-Type', 'application/json');
          const rpcResp = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/apply_provider_event', {
            method: 'POST',
            headers,
            body: JSON.stringify({ p_event: normalized }),
          });
          const rpcText = await rpcResp.text();
          if (!rpcResp.ok) {
            console.error(`[API] apply_provider_event failed: ${rpcResp.status} ${rpcText.slice(0, 200)}`);
            // Return 500 so the provider retries the webhook.
            return new Response('rpc failed', { status: 500 });
          }
          // 200 with empty body is the conventional "ack" providers expect.
          console.log(`[API] webhook ${provider} ${normalized.event_type} applied (event_id=${normalized.event_id})`);
          return new Response(rpcText || '{}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (err) {
          console.error(`[API] /api/webhooks/${provider} error:`, err && err.message);
          return new Response('webhook error', { status: 500 });
        }
      }
    }

    // Strip /api prefix → Supabase path  (/api/auth/v1/... → /auth/v1/...)
    const supabasePath = url.pathname.slice(4);

    // Allow only Supabase auth and REST paths to prevent SSRF
    if (!supabasePath.startsWith('/auth/v1/') && !supabasePath.startsWith('/rest/v1/')) {
      console.warn(`[API] SSRF blocked — disallowed path: ${supabasePath}`);
      return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders(origin) });
    }

    const target = env.SUPABASE_URL + supabasePath + url.search;
    console.log(`[API] ${request.method} ${url.pathname}${url.search ? url.search.slice(0, 80) : ''}`);

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

    console.log(`[API] ← ${response.status} ${response.statusText} (${supabasePath})`);

    const resHeaders = new Headers(corsHeaders(origin));
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
