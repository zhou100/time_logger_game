/**
 * Tests for the PostHog client wrapper. Three modes mirror the backend
 * wrapper:
 *   - empty REACT_APP_POSTHOG_KEY → no-op
 *   - NODE_ENV=test → no-op even when key is set
 *   - key set + NODE_ENV != test → real client init + capture passthrough
 */
import { capture, init, _resetForTests } from './analytics';

// Mock the posthog-js dynamic import. Jest hoists `jest.mock(...)` to the
// top of the file, before any top-level statements run — so the factory
// can only reference variables whose names start with `mock` (Jest's
// convention for "this is safe to access lazily inside a hoisted mock").
const mockPostHogCapture = jest.fn();
const mockPostHogInit = jest.fn();
jest.mock('posthog-js', () => ({
    __esModule: true,
    default: {
        init: (...args: unknown[]) => mockPostHogInit(...args),
        capture: (...args: unknown[]) => mockPostHogCapture(...args),
    },
}));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    mockPostHogCapture.mockReset();
    mockPostHogInit.mockReset();
    _resetForTests();
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

describe('analytics — gating', () => {
    it('with empty REACT_APP_POSTHOG_KEY: capture is a no-op (no init, no error)', () => {
        process.env.REACT_APP_POSTHOG_KEY = '';
        process.env.NODE_ENV = 'development';
        init();
        capture('landing_viewed');
        expect(mockPostHogInit).not.toHaveBeenCalled();
        expect(mockPostHogCapture).not.toHaveBeenCalled();
    });

    it("with NODE_ENV='test': capture is a no-op even when key is set", () => {
        process.env.REACT_APP_POSTHOG_KEY = 'phc_real';
        process.env.NODE_ENV = 'test';
        init();
        capture('landing_viewed');
        expect(mockPostHogInit).not.toHaveBeenCalled();
        expect(mockPostHogCapture).not.toHaveBeenCalled();
    });
});

describe('analytics — real init', () => {
    it('init() resolves the posthog-js dynamic import and calls capture', async () => {
        process.env.REACT_APP_POSTHOG_KEY = 'phc_real';
        process.env.NODE_ENV = 'development';

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

    it('honors REACT_APP_POSTHOG_HOST when set', async () => {
        process.env.REACT_APP_POSTHOG_KEY = 'phc_real';
        process.env.REACT_APP_POSTHOG_HOST = 'https://eu.i.posthog.com';
        process.env.NODE_ENV = 'development';

        init();
        await new Promise((r) => setTimeout(r, 0));
        const [, opts] = mockPostHogInit.mock.calls[0];
        expect((opts as { api_host: string }).api_host).toBe(
            'https://eu.i.posthog.com',
        );
    });
});
