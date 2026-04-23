/**
 * Tests for SignInForm (magic-link flow): email entry, link-sent confirmation,
 * resend cooldown, back link, Google button error path.
 *
 * Users never type a code — they click the link in their email. Supabase's
 * onAuthStateChange handles the redirect-back; this form only gets the email
 * out the door.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignInForm from './SignInForm';

const mockSendOTP = jest.fn();
const mockLoginWithGoogle = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
    __esModule: true,
    useAuth: () => ({
        sendOTP: mockSendOTP,
        loginWithGoogle: mockLoginWithGoogle,
        isAuthenticated: false,
        isLoading: false,
        user: null,
        logout: jest.fn(),
        refreshAccessToken: jest.fn(),
    }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
    const actual = jest.requireActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('../../theme', () => ({
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

function renderForm() {
    return render(
        <MemoryRouter>
            <SignInForm />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    jest.useFakeTimers();
    mockSendOTP.mockReset();
    mockLoginWithGoogle.mockReset();
    mockNavigate.mockReset();
});

afterEach(() => {
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
});

describe('SignInForm — step 1 (email)', () => {
    it('renders Google button + email field + send button', () => {
        renderForm();
        expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /email me a link/i })).toBeInTheDocument();
    });

    it('calls sendOTP on submit and transitions to the "sent" step', async () => {
        mockSendOTP.mockResolvedValue({});
        renderForm();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'me@test.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /email me a link/i }));
        });
        expect(mockSendOTP).toHaveBeenCalledWith('me@test.com');
        await waitFor(() => {
            expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
        });
    });

    it('shows the mapped error message when sendOTP fails', async () => {
        mockSendOTP.mockResolvedValue({ error: 'Too many attempts.' });
        renderForm();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'me@test.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /email me a link/i }));
        });
        expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    });
});

describe('SignInForm — step 2 (link sent)', () => {
    async function advanceToSentStep() {
        mockSendOTP.mockResolvedValue({});
        renderForm();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'me@test.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /email me a link/i }));
        });
        await waitFor(() => {
            expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
        });
    }

    it('shows the "check your inbox" confirmation with the email address', async () => {
        await advanceToSentStep();
        expect(screen.getByText('me@test.com')).toBeInTheDocument();
        expect(screen.getByText(/open the email and click the link/i)).toBeInTheDocument();
    });

    it('does not render an OTP code input (magic link flow)', async () => {
        await advanceToSentStep();
        expect(screen.queryByLabelText(/code/i)).not.toBeInTheDocument();
    });

    it('resend button respects 30s cooldown', async () => {
        await advanceToSentStep();
        const resend = screen.getByRole('button', { name: /resend/i });
        expect(resend).toBeDisabled();
        expect(resend.textContent).toMatch(/resend in/i);

        // Advance 30s in 1-second ticks so React flushes between cooldown updates
        for (let i = 0; i < 30; i++) {
            await act(async () => {
                jest.advanceTimersByTime(1000);
            });
        }
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /resend link/i })).not.toBeDisabled();
        });
    });

    it('"Wrong email?" link returns to step 1', async () => {
        await advanceToSentStep();
        fireEvent.click(screen.getByRole('button', { name: /wrong email/i }));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /email me a link/i })).toBeInTheDocument();
        });
    });
});
