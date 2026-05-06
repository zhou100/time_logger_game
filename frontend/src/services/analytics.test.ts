/**
 * Tests for the PostHog client wrapper. Three modes mirror the backend
 * wrapper:
 *   - empty VITE_POSTHOG_KEY → no-op
 *   - NODE_ENV=test → no-op even when key is set
 *   - key set + NODE_ENV != test → real client init + capture passthrough
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, init, _resetForTests } from './analytics';

const mockPostHogCapture = vi.fn();
const mockPostHogInit = vi.fn();
vi.mock('posthog-js', () => ({
    __esModule: true,
    default: {
        init: (...args: unknown[]) => mockPostHogInit(...args),
        capture: (...args: unknown[]) => mockPostHogCapture(...args),
    },
}));

beforeEach(() => {
    mockPostHogCapture.mockReset();
    mockPostHogInit.mockReset();
    _resetForTests();
});

afterEach(() => {
    vi.unstubAllEnvs();
});

afterAll(() => {
    vi.unstubAllEnvs();
});

describe('analytics — gating', () => {
    it('with empty VITE_POSTHOG_KEY: capture is a no-op (no init, no error)', () => {
        vi.stubEnv('VITE_POSTHOG_KEY', '');
        vi.stubEnv('NODE_ENV', 'development');
        init();
        capture('landing_viewed');
        expect(mockPostHogInit).not.toHaveBeenCalled();
        expect(mockPostHogCapture).not.toHaveBeenCalled();
    });

    it("with NODE_ENV='test': capture is a no-op even when key is set", () => {
        vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real');
        vi.stubEnv('NODE_ENV', 'test');
        init();
        capture('landing_viewed');
        expect(mockPostHogInit).not.toHaveBeenCalled();
        expect(mockPostHogCapture).not.toHaveBeenCalled();
    });
});

describe('analytics — real init', () => {
    it('init() resolves the posthog-js dynamic import and calls capture', async () => {
        vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real');
        vi.stubEnv('NODE_ENV', 'development');

        init();
        // Yield once to let the dynamic import promise resolve.
        await new Promise((r) => setTimeout(r, 0));
        expect(mockPostHogInit).toHaveBeenCalledTimes(1);
        const [key, opts] = mockPostHogInit.mock.calls[0];
        expect(key).toBe('phc_real');
        expect((opts as { api_host: string }).api_host).toBe('https://us.i.posthog.com');

        capture('mic_tapped', { surface: 'landing' });
        expect(mockPostHogCapture).toHaveBeenCalledTimes(1);
        const [event, props] = mockPostHogCapture.mock.calls[0];
        expect(event).toBe('mic_tapped');
        expect(props).toEqual({ surface: 'landing' });
    });

    it('honors VITE_POSTHOG_HOST when set', async () => {
        vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real');
        vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com');
        vi.stubEnv('NODE_ENV', 'development');

        init();
        await new Promise((r) => setTimeout(r, 0));
        const [, opts] = mockPostHogInit.mock.calls[0];
        expect((opts as { api_host: string }).api_host).toBe(
            'https://eu.i.posthog.com',
        );
    });
});
