/**
 * Tests for the /welcome post-OAuth handoff page.
 *
 * Covers:
 *  - Happy path (claimed > 0): claim API called with the JWT-backed axios
 *    instance, EntryCard renders with the just-claimed entry, "See all my
 *    entries" link points to /recording.
 *  - Idempotent / missing path (claimed === 0): empty fallback h2 + link,
 *    no EntryCard, no error UI.
 *  - API error: calm error fallback, no stack trace.
 *  - Missing ?state= param with a logged-in user: empty fallback (treated
 *    as user signed in without recording).
 *  - sessionStorage cleared (claim_token + permit) after any completion.
 *  - URL stripped of `state` query (history.replaceState invoked).
 *  - Spinner caps at 500ms when user never materializes (jest fake timers).
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WelcomePage from './WelcomePage';
import { CLAIM_STORAGE_KEY, PERMIT_STORAGE_KEY } from '../services/demoApi';

// ── api mock ─────────────────────────────────────────────────────────────────
//
// We mock the named exports (`entriesApi`) AND the default axios instance. The
// component uses `api.post(...)` for the claim call (non-public, JWT auto-
// attached by the interceptor) and `entriesApi.list(...)` to materialize the
// just-claimed entry.

const mockApiPost = jest.fn();
const mockListEntries = jest.fn();

jest.mock('../services/api', () => ({
    __esModule: true,
    default: { post: (...args: unknown[]) => mockApiPost(...args) },
    entriesApi: {
        list: (...args: unknown[]) => mockListEntries(...args),
        // Also stub other entriesApi methods that EntryCard touches via
        // tanstack-query (it calls getActiveDates inside a useQuery).
        getActiveDates: jest.fn().mockResolvedValue([]),
        deleteEntry: jest.fn(),
        updateEntry: jest.fn(),
        reclassifyEntry: jest.fn(),
    },
    API_BASE_URL: 'http://localhost:10000',
}));

// ── auth mock ────────────────────────────────────────────────────────────────

let mockUser: { id: number; email: string } | null = { id: 1, email: 'u@example.com' };
let mockAuthLoading = false;
jest.mock('../contexts/AuthContext', () => ({
    __esModule: true,
    useAuth: () => ({
        user: mockUser,
        isAuthenticated: !!mockUser,
        isLoading: mockAuthLoading,
        sendOTP: jest.fn(),
        loginWithGoogle: jest.fn(),
        logout: jest.fn(),
        refreshAccessToken: jest.fn(),
    }),
    mapAuthError: (e: { message?: string }) => e?.message ?? 'err',
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Analytics seam — assert event names without touching real posthog-js.
const mockAnalyticsCapture = jest.fn();
jest.mock('../services/analytics', () => ({
    __esModule: true,
    capture: (...args: unknown[]) => mockAnalyticsCapture(...args),
    init: jest.fn(),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function renderWelcome(initialPath = '/welcome?state=fake-claim-token') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[initialPath]}>
                <Routes>
                    <Route path="/welcome" element={<WelcomePage />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

const claimedEntry = {
    id: 'entry-claimed-1',
    transcript: 'I was distracted today and not sure why.',
    recorded_at: '2026-04-24T15:24:00Z',
    created_at: '2026-04-24T15:24:00Z',
    local_date: '2026-04-24',
    duration_seconds: 28,
    categories: [
        { id: 'c1', text: 'Notice what breaks focus next time', category: 'TODO' },
    ],
};

let replaceStateSpy: jest.SpyInstance;

beforeEach(() => {
    mockUser = { id: 1, email: 'u@example.com' };
    mockAuthLoading = false;
    mockApiPost.mockReset();
    mockListEntries.mockReset();
    mockAnalyticsCapture.mockReset();
    sessionStorage.clear();
    sessionStorage.setItem(CLAIM_STORAGE_KEY, 'leftover-claim');
    sessionStorage.setItem(PERMIT_STORAGE_KEY, 'leftover-permit');
    replaceStateSpy = jest.spyOn(window.history, 'replaceState');
});

afterEach(() => {
    replaceStateSpy.mockRestore();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('WelcomePage — claim flow', () => {
    it('with ?state=<token> + signed-in user: calls claim with that token', async () => {
        mockApiPost.mockResolvedValue({ data: { claimed: 1, entry_ids: [claimedEntry.id] } });
        mockListEntries.mockResolvedValue({ items: [claimedEntry], total: 1, skip: 0, limit: 5 });
        renderWelcome('/welcome?state=raw-token');

        await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
        expect(mockApiPost).toHaveBeenCalledWith(
            '/v1/entries/claim-demo-session',
            { claim_token: 'raw-token' },
        );
    });

    it('renders success h2 + EntryCard + forward link when claimed > 0', async () => {
        mockApiPost.mockResolvedValue({ data: { claimed: 1, entry_ids: [claimedEntry.id] } });
        mockListEntries.mockResolvedValue({ items: [claimedEntry], total: 1, skip: 0, limit: 5 });
        renderWelcome();

        await waitFor(() =>
            expect(screen.getByRole('heading', { name: /your debrief is saved/i })).toBeInTheDocument(),
        );
        // EntryCard renders the categorized line (not the raw transcript) when
        // categories are present.
        expect(
            screen.getByText(/notice what breaks focus next time/i),
        ).toBeInTheDocument();
        const forward = screen.getByRole('link', { name: /see all my entries/i });
        expect(forward).toHaveAttribute('href', '/recording');
    });

    it('renders empty fallback when claimed === 0 (idempotent replay)', async () => {
        mockApiPost.mockResolvedValue({ data: { claimed: 0, entry_ids: [] } });
        renderWelcome();

        await waitFor(() =>
            expect(screen.getByRole('heading', { name: /your account is ready/i })).toBeInTheDocument(),
        );
        expect(screen.getByText(/start by recording your first debrief/i)).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: /your debrief is saved/i }),
        ).not.toBeInTheDocument();
        // No EntryCard category line rendered
        expect(
            screen.queryByText(/notice what breaks focus next time/i),
        ).not.toBeInTheDocument();
    });

    it('renders calm error fallback when claim API throws', async () => {
        mockApiPost.mockRejectedValue(new Error('boom'));
        renderWelcome();

        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: /we'll find your entry in a moment/i }),
            ).toBeInTheDocument(),
        );
        expect(screen.getByRole('link', { name: /take me to my recordings/i })).toHaveAttribute(
            'href',
            '/recording',
        );
        // No alarming words leaked
        expect(screen.queryByText(/error|failed|stack/i)).not.toBeInTheDocument();
    });

    it('without ?state= param: empty fallback (no API call)', async () => {
        renderWelcome('/welcome');
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: /your account is ready/i })).toBeInTheDocument(),
        );
        expect(mockApiPost).not.toHaveBeenCalled();
    });
});

describe('WelcomePage — cleanup', () => {
    it('removes claim_token + permit from sessionStorage after success', async () => {
        mockApiPost.mockResolvedValue({ data: { claimed: 1, entry_ids: [claimedEntry.id] } });
        mockListEntries.mockResolvedValue({ items: [claimedEntry], total: 1, skip: 0, limit: 5 });
        renderWelcome();

        await waitFor(() =>
            expect(screen.getByRole('heading', { name: /your debrief is saved/i })).toBeInTheDocument(),
        );
        expect(sessionStorage.getItem(CLAIM_STORAGE_KEY)).toBeNull();
        expect(sessionStorage.getItem(PERMIT_STORAGE_KEY)).toBeNull();
    });

    it('strips ?state= from URL via history.replaceState after completion', async () => {
        mockApiPost.mockResolvedValue({ data: { claimed: 0, entry_ids: [] } });
        renderWelcome('/welcome?state=will-be-stripped');

        await waitFor(() =>
            expect(screen.getByRole('heading', { name: /your account is ready/i })).toBeInTheDocument(),
        );
        // The component calls history.replaceState({}, '', '/welcome'). Asserting
        // the call matters more than reading window.location (MemoryRouter has
        // its own location object).
        expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/welcome');
    });

    it('clears tokens even on the error path', async () => {
        mockApiPost.mockRejectedValue(new Error('boom'));
        renderWelcome();

        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: /we'll find your entry/i }),
            ).toBeInTheDocument(),
        );
        expect(sessionStorage.getItem(CLAIM_STORAGE_KEY)).toBeNull();
        expect(sessionStorage.getItem(PERMIT_STORAGE_KEY)).toBeNull();
    });
});

describe('WelcomePage — spinner cap', () => {
    it('falls through to error fallback when user never materializes within 500ms', async () => {
        mockUser = null;
        mockAuthLoading = true;
        jest.useFakeTimers();
        try {
            renderWelcome();
            // Spinner state initially.
            expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();

            await act(async () => {
                jest.advanceTimersByTime(600);
            });

            await waitFor(() =>
                expect(
                    screen.getByRole('heading', { name: /we'll find your entry/i }),
                ).toBeInTheDocument(),
            );
            // Claim never fired because no user was available.
            expect(mockApiPost).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('WelcomePage — analytics events', () => {
    function eventsFired(name: string) {
        return mockAnalyticsCapture.mock.calls.filter((c) => c[0] === name);
    }

    it('fires `signup_completed` once on mount with a logged-in user', async () => {
        mockApiPost.mockResolvedValue({ data: { claimed: 0, entry_ids: [] } });
        renderWelcome('/welcome');
        // Wait for the empty fallback to render so the effect chain has run.
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: /your account is ready/i }),
            ).toBeInTheDocument(),
        );
        const calls = eventsFired('signup_completed');
        expect(calls.length).toBe(1);
    });

    it('fires `demo_claim_succeeded` with claimed_count + entry_id when claimed > 0', async () => {
        mockApiPost.mockResolvedValue({
            data: { claimed: 2, entry_ids: ['eid-1', 'eid-2'] },
        });
        mockListEntries.mockResolvedValue({
            items: [claimedEntry],
            total: 1,
            skip: 0,
            limit: 5,
        });
        renderWelcome();

        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: /your debrief is saved/i }),
            ).toBeInTheDocument(),
        );
        const calls = eventsFired('demo_claim_succeeded');
        expect(calls.length).toBe(1);
        expect(calls[0][1]).toEqual({ claimed_count: 2, entry_id: 'eid-1' });
    });

    it('fires `demo_claim_missing` when claimed === 0', async () => {
        mockApiPost.mockResolvedValue({ data: { claimed: 0, entry_ids: [] } });
        renderWelcome();
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: /your account is ready/i }),
            ).toBeInTheDocument(),
        );
        expect(eventsFired('demo_claim_missing').length).toBe(1);
        expect(eventsFired('demo_claim_succeeded').length).toBe(0);
    });

    it('fires `demo_claim_failed` with error_message when the API throws', async () => {
        mockApiPost.mockRejectedValue(new Error('boom'));
        renderWelcome();
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: /we'll find your entry/i }),
            ).toBeInTheDocument(),
        );
        const calls = eventsFired('demo_claim_failed');
        expect(calls.length).toBe(1);
        expect(calls[0][1]).toEqual({ error_message: 'boom' });
    });
});
