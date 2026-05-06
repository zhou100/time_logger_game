/**
 * Tests for the api.ts axios interceptor (Supabase session token + 401 refresh).
 *
 * Strategy:
 *  - mocks defined inside jest.mock factories to avoid TDZ/hoisting issues
 *  - capture the interceptor handlers registered on axios.interceptors so we
 *    can invoke them directly without going over the network
 */
import type { Mock } from 'vitest';

vi.mock('axios', () => {
    // Captured interceptor handlers; tests read these via __captured.
    const captured: {
        requestHandler?: (cfg: any) => Promise<any> | any;
        responseErrorHandler?: (err: any) => Promise<any> | any;
    } = {};

    const instance: any = {
        interceptors: {
            request: {
                use: vi.fn((fn: any) => { captured.requestHandler = fn; return 0; }),
            },
            response: {
                use: vi.fn((_success: any, errFn: any) => {
                    captured.responseErrorHandler = errFn;
                    return 0;
                }),
            },
        },
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    };
    // Make the instance callable so `api(original)` resolves in retry paths.
    const callable: any = function callable(cfg: any) {
        return Promise.resolve({ data: 'retried-ok', config: cfg });
    };
    Object.assign(callable, instance);
    const create = vi.fn(() => callable);
    return {
        __esModule: true,
        default: { create, isAxiosError: (e: any) => !!e?.isAxiosError },
        create,
        isAxiosError: (e: any) => !!e?.isAxiosError,
        __captured: captured,
    };
});

vi.mock('./supabase', () => {
    const refreshSession = vi.fn();
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const auth = { refreshSession, signOut };
    return {
        __esModule: true,
        getSupabase: () => ({ auth }),
        isSupabaseConfigured: true,
        __mocks: { refreshSession, signOut },
    };
});

vi.mock('./supabaseStorage', () => {
    const readSupabaseSession = vi.fn();
    return {
        __esModule: true,
        readSupabaseSession,
        __mocks: { readSupabaseSession },
    };
});

// Importing './api' registers the interceptors; handlers land in captured.
import './api';
import * as axiosMock from 'axios';
import * as supabaseMock from './supabase';
import * as storageMock from './supabaseStorage';

const { requestHandler, responseErrorHandler } = (axiosMock as unknown as {
    __captured: {
        requestHandler: (cfg: any) => Promise<any>;
        responseErrorHandler: (err: any) => Promise<any>;
    };
}).__captured;
const { refreshSession, signOut } = (supabaseMock as unknown as {
    __mocks: { refreshSession: Mock; signOut: Mock };
}).__mocks;
const { readSupabaseSession } = (storageMock as unknown as {
    __mocks: { readSupabaseSession: Mock };
}).__mocks;

function makeAxiosError(status: number): any {
    return {
        isAxiosError: true,
        response: { status, data: {} },
        config: { url: '/v1/entries', headers: {}, method: 'get' },
        message: `Request failed ${status}`,
    };
}

describe('api.ts interceptor — request: attach Bearer token', () => {
    beforeEach(() => {
        readSupabaseSession.mockReset();
        refreshSession.mockReset();
    });

    it('attaches a fresh token from the synchronous Supabase session read', async () => {
        readSupabaseSession.mockReturnValue({
            access_token: 'abc123',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
        const cfg: any = { url: '/v1/entries', headers: {} };
        const out = await requestHandler(cfg);
        expect(out.headers['Authorization']).toBe('Bearer abc123');
    });

    it('skips Authorization on public auth paths', async () => {
        readSupabaseSession.mockReturnValue({
            access_token: 'abc123',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
        const cfg: any = { url: '/v1/auth/token', headers: {} };
        const out = await requestHandler(cfg);
        expect(out.headers['Authorization']).toBeUndefined();
    });

    it('refreshes when the session is near expiry (inside skew margin)', async () => {
        readSupabaseSession.mockReturnValue({
            access_token: 'stale',
            expires_at: Math.floor(Date.now() / 1000) + 5,
        });
        refreshSession.mockResolvedValue({
            data: { session: { access_token: 'fresh' } },
            error: null,
        });
        const cfg: any = { url: '/v1/entries', headers: {} };
        const out = await requestHandler(cfg);
        expect(refreshSession).toHaveBeenCalled();
        expect(out.headers['Authorization']).toBe('Bearer fresh');
    });

    it('sends no Authorization when no session is stored', async () => {
        readSupabaseSession.mockReturnValue(null);
        const cfg: any = { url: '/v1/entries', headers: {} };
        const out = await requestHandler(cfg);
        expect(out.headers['Authorization']).toBeUndefined();
    });
});

describe('api.ts interceptor — response: 401 handling', () => {
    beforeEach(() => {
        refreshSession.mockReset();
        signOut.mockClear();
    });

    it('refreshes the session on 401 and retries the original request', async () => {
        refreshSession.mockResolvedValue({
            data: { session: { access_token: 'refreshed' } },
            error: null,
        });
        const err = makeAxiosError(401);
        const result = await responseErrorHandler(err);
        expect(refreshSession).toHaveBeenCalledTimes(1);
        expect(result.data).toBe('retried-ok');
        expect(err.config.headers['Authorization']).toBe('Bearer refreshed');
        expect(err.config._retry).toBe(true);
    });

    it('signs out when refresh fails on a 401', async () => {
        refreshSession.mockResolvedValue({
            data: { session: null },
            error: { message: 'refresh failed' },
        });
        const err = makeAxiosError(401);
        await expect(responseErrorHandler(err)).rejects.toBeDefined();
        expect(signOut).toHaveBeenCalled();
    });
});
