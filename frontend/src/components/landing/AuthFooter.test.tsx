/**
 * Tests for AuthFooter — focused on the REACT_APP_WELCOME_HANDOFF_ENABLED
 * feature flag. Existing footer behaviors (rendering, magic-link form, error
 * mapping) are exercised via LandingPage.test.tsx; this file pins the flag
 * gating that LandingPage doesn't cover directly.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthFooter from './AuthFooter';
import { CLAIM_STORAGE_KEY } from '../../services/demoApi';

const mockSignInWithOAuth = jest.fn();
const mockSupabaseSignInWithOtp = jest.fn();
jest.mock('../../services/supabase', () => ({
    __esModule: true,
    getSupabase: () => ({
        auth: {
            signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
            signInWithOtp: (...args: unknown[]) => mockSupabaseSignInWithOtp(...args),
        },
    }),
    isSupabaseConfigured: true,
}));

jest.mock('../../contexts/AuthContext', () => ({
    __esModule: true,
    useAuth: () => ({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        sendOTP: jest.fn(),
        verifyOTP: jest.fn(),
        loginWithGoogle: jest.fn(),
        logout: jest.fn(),
        refreshAccessToken: jest.fn(),
    }),
    mapAuthError: (e: { message?: string }) => e?.message ?? 'err',
}));

const mockAnalyticsCapture = jest.fn();
jest.mock('../../services/analytics', () => ({
    __esModule: true,
    capture: (...args: unknown[]) => mockAnalyticsCapture(...args),
    init: jest.fn(),
}));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REACT_APP_WELCOME_HANDOFF_ENABLED;
    mockSignInWithOAuth.mockReset();
    mockSupabaseSignInWithOtp.mockReset();
    mockAnalyticsCapture.mockReset();
    sessionStorage.clear();
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

function renderFooter() {
    return render(
        <MemoryRouter>
            <AuthFooter />
        </MemoryRouter>,
    );
}

describe('AuthFooter — REACT_APP_WELCOME_HANDOFF_ENABLED', () => {
    it("when 'false', Google OAuth redirectTo points at /recording with no state param", async () => {
        process.env.REACT_APP_WELCOME_HANDOFF_ENABLED = 'false';
        // Even if a claim_token is in sessionStorage, the flag wins.
        sessionStorage.setItem(CLAIM_STORAGE_KEY, 'should-be-ignored');
        mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });

        renderFooter();
        fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

        await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));
        const arg = mockSignInWithOAuth.mock.calls[0][0];
        expect(arg.options.redirectTo).toMatch(/\/recording$/);
        expect(arg.options.redirectTo).not.toContain('state=');
        expect(arg.options.redirectTo).not.toContain('/welcome');
    });

    it("when unset, redirectTo lands on /welcome (handoff default)", async () => {
        // env unset
        mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });

        renderFooter();
        fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

        await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));
        const arg = mockSignInWithOAuth.mock.calls[0][0];
        expect(arg.options.redirectTo).toContain('/welcome');
    });

    it("when 'true', redirectTo lands on /welcome and threads claim_token state", async () => {
        process.env.REACT_APP_WELCOME_HANDOFF_ENABLED = 'true';
        sessionStorage.setItem(CLAIM_STORAGE_KEY, 'abc123.signature');
        mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });

        renderFooter();
        fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

        await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));
        const arg = mockSignInWithOAuth.mock.calls[0][0];
        expect(arg.options.redirectTo).toContain('/welcome');
        expect(arg.options.redirectTo).toContain('state=');
        expect(decodeURIComponent(arg.options.redirectTo)).toContain('abc123.signature');
    });
});

describe('AuthFooter — save_clicked analytics', () => {
    function eventsFired(name: string) {
        return mockAnalyticsCapture.mock.calls.filter((c) => c[0] === name);
    }

    it('fires `save_clicked` with method=google on Google sign-in click', async () => {
        mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
        renderFooter();
        fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
        await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));
        const calls = eventsFired('save_clicked');
        expect(calls.length).toBe(1);
        expect(calls[0][1]).toEqual({ method: 'google' });
    });

    it('fires `save_clicked` with method=email_code on email form submit', async () => {
        mockSupabaseSignInWithOtp.mockResolvedValue({ data: {}, error: null });
        renderFooter();
        fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));
        const input = screen.getByPlaceholderText(/you@example.com/i);
        fireEvent.change(input, { target: { value: 'a@b.co' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /email me a code/i }));
        });
        const calls = eventsFired('save_clicked');
        expect(calls.length).toBe(1);
        expect(calls[0][1]).toEqual({ method: 'email_code' });
    });
});
