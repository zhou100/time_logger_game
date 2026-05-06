/**
 * PostHog analytics — client-side product event capture.
 *
 * Lazy-init pattern: a real PostHog client loads only when
 * `import.meta.env.VITE_POSTHOG_KEY` is non-empty AND we're not in
 * `NODE_ENV === 'test'`. Otherwise `capture()` is a no-op stub so call
 * sites never need to null-check. CRA inlines REACT_APP_* at build time.
 *
 * Distinct ID: PostHog generates and persists its own anonymous id in
 * localStorage. We never read the HttpOnly `tlg_demo_sid` cookie from JS;
 * the server stamps `demo_session_id` on its own events so the funnel
 * joins client + server properties on a property, not the distinct id.
 *
 * Stable surface: this module exports `capture(event, properties?)` —
 * everything else (init, lazy-load, host selection) is private.
 */

type Properties = Record<string, unknown>;

let initialized = false;
let initStarted = false;
// Cache the loaded posthog-js module so we don't re-import on every event.
// `unknown` here keeps the consumer-facing API clean — the real shape lives
// inside `posthog-js` and we narrow only at the use site.
let posthogClient: unknown = null;

function isEnabled(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    return !!import.meta.env.VITE_POSTHOG_KEY;
}

function getHost(): string {
    return import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
}

/**
 * Eagerly load + init PostHog. Call once from index.tsx after the app boots.
 * Idempotent: subsequent calls no-op.
 *
 * Network failure / missing key → silent fall-through to no-op behavior.
 * Production code never sees an exception from this path.
 */
export function init(): void {
    if (initStarted || !isEnabled()) return;
    initStarted = true;
    // Dynamic import keeps the posthog-js bundle out of the critical path
    // when the key isn't configured — webpack code-splits the chunk.
    import('posthog-js')
        .then((mod) => {
            try {
                const ph = mod.default;
                ph.init(import.meta.env.VITE_POSTHOG_KEY as string, {
                    api_host: getHost(),
                    // Defer feature-flag bootstrap to event capture time;
                    // we don't gate UI on flags.
                    capture_pageview: true,
                    persistence: 'localStorage',
                });
                posthogClient = ph;
                initialized = true;
            } catch {
                // swallow — analytics must never break the app
            }
        })
        .catch(() => {
            // posthog-js failed to load (offline, blocked, etc.) — no-op.
        });
}

/**
 * Capture a product analytics event.
 *
 * Safe to call before `init()` finishes — events queued before the client
 * loads are dropped on the floor, which is the right tradeoff for an
 * anonymous landing flow where the first few events (e.g. `landing_viewed`
 * within the first 50ms) are noise. Once the lazy import resolves, all
 * subsequent events flush normally.
 *
 * `properties` is optional; when present it ships through verbatim.
 */
export function capture(event: string, properties?: Properties): void {
    if (!isEnabled() || !initialized || posthogClient === null) return;
    try {
        // Narrowing here keeps the rest of the module dependency-free for
        // tests and type-checking when posthog-js isn't installed.
        const ph = posthogClient as { capture: (e: string, p?: Properties) => void };
        ph.capture(event, properties);
    } catch {
        // never raise from analytics
    }
}

/**
 * Test-only: reset internal init state so a unit test can flip
 * NODE_ENV / REACT_APP_POSTHOG_KEY between cases.
 */
export function _resetForTests(): void {
    initialized = false;
    initStarted = false;
    posthogClient = null;
}
