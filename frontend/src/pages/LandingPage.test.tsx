/**
 * Tests for LandingPage: hero CTA row, Open Loops demo, Recurring Themes demo,
 * coach quote, footer CTA, Google sign-in integration.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from './LandingPage';

const mockLoginWithGoogle = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
    __esModule: true,
    useAuth: () => ({
        loginWithGoogle: mockLoginWithGoogle,
        isAuthenticated: false,
        isLoading: false,
        user: null,
        sendOTP: jest.fn(),
        verifyOTP: jest.fn(),
        logout: jest.fn(),
        refreshAccessToken: jest.fn(),
    }),
}));

jest.mock('../theme', () => ({
    __esModule: true,
    palette: {
        accent: '#B6492D',
        textMuted: '#6F6258',
        textPrimary: '#201815',
        rule: '#C4B8A8',
    },
    theme: {},
    CATEGORY_COLORS: {},
    CATEGORY_LABELS: {},
}));

function renderPage() {
    return render(
        <MemoryRouter>
            <LandingPage />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    mockLoginWithGoogle.mockReset();
});

describe('LandingPage', () => {
    it('renders the hero headline and subhead', () => {
        renderPage();
        expect(screen.getByRole('heading', { name: /debrief your day/i })).toBeInTheDocument();
        expect(screen.getByText(/no timers. no typing/i)).toBeInTheDocument();
    });

    it('shows both CTA buttons in the hero — Google and Start your debrief', () => {
        renderPage();
        expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /start your debrief/i })).toBeInTheDocument();
    });

    it('renders Open Loops section with demo items', () => {
        renderPage();
        expect(screen.getByText(/open loops/i)).toBeInTheDocument();
        expect(screen.getByText(/fix the login bug/i)).toBeInTheDocument();
        expect(screen.getByText(/block time for deep work/i)).toBeInTheDocument();
        expect(screen.getByText(/review design mockups/i)).toBeInTheDocument();
    });

    it('renders Recurring Themes section with counts', () => {
        renderPage();
        expect(screen.getByText(/recurring themes/i)).toBeInTheDocument();
        expect(screen.getByText('deep work')).toBeInTheDocument();
        expect(screen.getByText('4×')).toBeInTheDocument();
        expect(screen.getByText('client prep')).toBeInTheDocument();
        expect(screen.getByText('3×')).toBeInTheDocument();
    });

    it('renders the AI Coach letter with a coaching quote', () => {
        renderPage();
        expect(screen.getByText(/ai coach/i)).toBeInTheDocument();
        expect(screen.getByText(/you keep circling back to focus/i)).toBeInTheDocument();
    });

    it('calls loginWithGoogle when the Google button is clicked', async () => {
        mockLoginWithGoogle.mockResolvedValue(undefined);
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
        await waitFor(() => expect(mockLoginWithGoogle).toHaveBeenCalled());
    });

    it('shows an error alert if Google sign-in fails', async () => {
        mockLoginWithGoogle.mockRejectedValue(new Error('Popup was blocked'));
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
        await waitFor(() => expect(screen.getByText(/popup was blocked/i)).toBeInTheDocument());
    });
});
