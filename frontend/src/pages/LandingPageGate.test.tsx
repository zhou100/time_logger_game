/**
 * Tests for the sign-in gate that fires after the first real debrief.
 *
 * Gate fires only when:
 *   - recState === 'done' AND classifications.length >= 1
 *
 * Edge cases that should NOT gate (user must be able to retry freely):
 *   - error / capped / mic-denied
 *   - done with empty classifications (silent recording / Whisper-empty)
 *
 * We mock `useDemoRecording` so the test drives terminal hook states
 * directly instead of running the whole recording pipeline.
 */
import React from 'react';
import { render, screen, fireEvent, waitForElementToBeRemoved } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from './LandingPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockHookReturn = {
    state: 'idle',
    step: null,
    summary: null,
    classifications: [],
    demoTeaser: null,
    fakeOutput: null,
    transcript: null,
    error: null,
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
};

jest.mock('../hooks/useDemoRecording', () => ({
    __esModule: true,
    useDemoRecording: () => mockHookReturn,
}));

jest.mock('../services/supabase', () => ({
    __esModule: true,
    getSupabase: () => ({
        auth: { signInWithOAuth: jest.fn(), signInWithOtp: jest.fn() },
    }),
    isSupabaseConfigured: true,
}));

jest.mock('../services/analytics', () => ({
    __esModule: true,
    capture: jest.fn(),
    init: jest.fn(),
}));

jest.mock('../contexts/AuthContext', () => {
    const real = jest.requireActual('../contexts/AuthContext');
    return {
        ...real,
        useAuth: () => ({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            sendOTP: jest.fn(),
            loginWithGoogle: jest.fn(),
            logout: jest.fn(),
            refreshAccessToken: jest.fn(),
        }),
    };
});

jest.mock('../services/demoApi', () => ({
    __esModule: true,
    demoApi: {
        verifyTurnstile: jest.fn(),
        presign: jest.fn(),
        uploadAudio: jest.fn(),
        submit: jest.fn(),
        status: jest.fn(),
    },
    readPermit: () => ({ token: 'cached-permit', expires_at: '2099-01-01T00:00:00Z' }),
    writePermit: jest.fn(),
    readClaimToken: jest.fn(),
    writeClaimToken: jest.fn(),
    detectCookieBlocked: jest.fn().mockResolvedValue(false),
}));

beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockReturnValue({
            matches: false,
            media: '',
            onchange: null,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            addListener: jest.fn(),
            removeListener: jest.fn(),
            dispatchEvent: jest.fn(),
        }),
    });
    mockHookReturn.start.mockClear();
    mockHookReturn.stop.mockClear();
    mockHookReturn.reset.mockClear();
});

function setHookState(overrides) {
    Object.assign(mockHookReturn, overrides);
}

function renderPage() {
    return render(
        <MemoryRouter>
            <LandingPage />
        </MemoryRouter>,
    );
}

function tapMic() {
    fireEvent.click(screen.getByLabelText(/tap to speak/i));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LandingPage — sign-in gate', () => {
    it('opens the gate after a real debrief (done + classifications)', () => {
        setHookState({
            state: 'done',
            classifications: [{ text: 'finish design', category: 'TODO' }],
        });
        renderPage();

        tapMic();

        expect(screen.getByText(/Save this debrief to keep going/i)).toBeInTheDocument();
        // start() must NOT have fired — the gate intercepts the tap.
        expect(mockHookReturn.start).not.toHaveBeenCalled();
        // reset() must NOT have fired — the debrief stays visible behind the modal.
        expect(mockHookReturn.reset).not.toHaveBeenCalled();
    });

    it('does NOT gate when classifications are empty (silent recording)', () => {
        setHookState({ state: 'done', classifications: [] });
        renderPage();

        tapMic();

        expect(
            screen.queryByText(/Save this debrief to keep going/i),
        ).not.toBeInTheDocument();
        expect(mockHookReturn.reset).toHaveBeenCalled();
        expect(mockHookReturn.start).toHaveBeenCalled();
    });

    it('does NOT gate after an error', () => {
        setHookState({
            state: 'error',
            classifications: [],
            error: 'Something went wrong.',
        });
        renderPage();

        tapMic();

        expect(
            screen.queryByText(/Save this debrief to keep going/i),
        ).not.toBeInTheDocument();
        expect(mockHookReturn.reset).toHaveBeenCalled();
        expect(mockHookReturn.start).toHaveBeenCalled();
    });

    it('does NOT gate after a capped (cost-limited) submission', () => {
        setHookState({
            state: 'capped',
            classifications: [],
            fakeOutput: { summary: 'demo at rest', key_points: [], todos: [] },
        });
        renderPage();

        tapMic();

        expect(
            screen.queryByText(/Save this debrief to keep going/i),
        ).not.toBeInTheDocument();
        expect(mockHookReturn.reset).toHaveBeenCalled();
        expect(mockHookReturn.start).toHaveBeenCalled();
    });

    it('re-opens the gate on subsequent taps after dismiss (regression)', async () => {
        setHookState({
            state: 'done',
            classifications: [{ text: 'finish design', category: 'TODO' }],
        });
        renderPage();

        // First tap → gate opens.
        tapMic();
        const title = screen.getByText(/Save this debrief to keep going/i);
        expect(title).toBeInTheDocument();

        // Dismiss via "View your debrief". MUI Dialog animates out, so we wait
        // for the title to actually leave the DOM before re-tapping.
        fireEvent.click(screen.getByText(/View your debrief/i));
        await waitForElementToBeRemoved(() =>
            screen.queryByText(/Save this debrief to keep going/i),
        );

        // Second tap → gate re-opens. start() must STILL not have fired.
        tapMic();
        expect(
            await screen.findByText(/Save this debrief to keep going/i),
        ).toBeInTheDocument();
        expect(mockHookReturn.start).not.toHaveBeenCalled();
    });
});
