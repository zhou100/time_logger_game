/**
 * Tests for preferencesApi + PreferencesValidationError mapping.
 *
 * We mock axios so we never hit the network and can simulate response
 * shapes (200, 422 with FastAPI's `loc/msg` array, 500).
 */

vi.mock('axios', () => {
  const instance = {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  const isAxiosError = (e: any) => Boolean(e && e.isAxiosError);
  const create = vi.fn(() => instance);
  return {
    __esModule: true,
    default: { create, isAxiosError },
    create,
    isAxiosError,
  };
});

// api.ts pulls in Supabase for the token attach + 401 refresh. Stub both the
// synchronous session read and the supabase client's refreshSession.
vi.mock('./supabase', () => ({
  __esModule: true,
  getSupabase: vi.fn(() => ({
    auth: {
      refreshSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'new-token' } },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
  isSupabaseConfigured: true,
}));

vi.mock('./supabaseStorage', () => ({
  __esModule: true,
  readSupabaseSession: vi.fn(() => ({
    access_token: 'test-token',
    // Far-future expiry so the hot path doesn't trigger a refresh.
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { email: 'test@example.com' },
  })),
}));

import axios from 'axios';
import { preferencesApi, PreferencesValidationError } from './api';

// The single axios instance returned by the mocked `axios.create`.
const mockAxiosInstance = (axios as any).create();

function makeAxiosError(status: number, data: unknown) {
  const err: any = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true;
  err.response = { status, data };
  err.config = {};
  return err;
}

describe('preferencesApi.get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the preferences body from /v1/users/me/preferences', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        tone: 'direct',
        pacing: 'reflective',
        language_lock: 'zh',
        avoid_topics: ['weight'],
      },
    });

    const result = await preferencesApi.get();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/users/me/preferences');
    expect(result).toEqual({
      tone: 'direct',
      pacing: 'reflective',
      language_lock: 'zh',
      avoid_topics: ['weight'],
    });
  });

  it('maps a 500 to a friendly server error', async () => {
    mockAxiosInstance.get.mockRejectedValueOnce(makeAxiosError(500, { detail: 'boom' }));
    await expect(preferencesApi.get()).rejects.toThrow(/server error/i);
  });
});

describe('preferencesApi.patch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PATCHes the body and returns the updated preferences', async () => {
    const body = {
      tone: 'playful' as const,
      pacing: 'both' as const,
      language_lock: 'auto' as const,
      avoid_topics: ['sleep'],
    };
    mockAxiosInstance.patch.mockResolvedValueOnce({
      data: { ...body },
    });

    const result = await preferencesApi.patch(body);

    expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/v1/users/me/preferences', body);
    expect(result).toEqual(body);
  });

  it('passes through an all-null reset body', async () => {
    const reset = {
      tone: null,
      pacing: null,
      language_lock: null,
      avoid_topics: null,
    };
    mockAxiosInstance.patch.mockResolvedValueOnce({
      data: {
        tone: 'warm',
        pacing: 'actionable',
        language_lock: 'auto',
        avoid_topics: [],
      },
    });

    await preferencesApi.patch(reset);

    expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/v1/users/me/preferences', reset);
  });

  it('throws PreferencesValidationError with per-field messages on a 422', async () => {
    // FastAPI-style detail array.
    mockAxiosInstance.patch.mockRejectedValueOnce(
      makeAxiosError(422, {
        detail: [
          { loc: ['body', 'tone'], msg: 'Input should be warm, direct or playful', type: 'enum' },
          { loc: ['body', 'avoid_topics'], msg: 'too many topics', type: 'value_error' },
        ],
      })
    );

    let caught: unknown;
    try {
      await preferencesApi.patch({ tone: 'warm' as any });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PreferencesValidationError);
    const err = caught as PreferencesValidationError;
    expect(err.fields).toEqual({
      tone: 'Input should be warm, direct or playful',
      avoid_topics: 'too many topics',
    });
    expect(err.message).toMatch(/some preferences are invalid/i);
  });

  it('returns an empty fields map when 422 detail is malformed', async () => {
    mockAxiosInstance.patch.mockRejectedValueOnce(
      makeAxiosError(422, { detail: 'free-form string, not an array' })
    );

    let caught: unknown;
    try {
      await preferencesApi.patch({});
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(PreferencesValidationError);
    expect((caught as PreferencesValidationError).fields).toEqual({});
  });

  it('falls through to the generic error mapper for non-422 failures', async () => {
    mockAxiosInstance.patch.mockRejectedValueOnce(makeAxiosError(500, { detail: 'boom' }));
    await expect(preferencesApi.patch({})).rejects.toThrow(/server error/i);
  });
});
