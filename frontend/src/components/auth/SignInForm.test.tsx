/**
 * Tests for SignInForm (OTP code-entry flow): email entry, code-entry step,
 * verify success, verify error, resend cooldown, back link, Google button error path.
 *
 * User types the 6-digit code from email into the form (avoids iOS Safari
 * magic-link cross-app handoff). On verifyOTP success, AuthContext's
 * onAuthStateChange handles the redirect.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignInForm from './SignInForm';

const mockSendOTP = jest.fn();
const mockVerifyOTP = jest.fn();
const mockLoginWithGoogle = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
    __esModule: true,
    useAuth: () => ({
        sendOTP: mockSendOTP,
        verifyOTP: mockVerifyOTP,
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
    mockVerifyOTP.mockReset();
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
        expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
    });

    it('calls sendOTP on submit and transitions to the code step', async () => {
        mockSendOTP.mockResolvedValue({});
        renderForm();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'me@test.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /email me a code/i }));
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
            fireEvent.click(screen.getByRole('button', { name: /email me a code/i }));
        });
        expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    });
});

describe('SignInForm — step 2 (code entry)', () => {
    async function advanceToCodeStep() {
        mockSendOTP.mockResolvedValue({});
        renderForm();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'me@test.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /email me a code/i }));
        });
        await waitFor(() => {
            expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
        });
    }

    it('shows the code-entry confirmation with the email address', async () => {
        await advanceToCodeStep();
        expect(screen.getByText('me@test.com')).toBeInTheDocument();
        expect(screen.getByText(/enter it below to sign in/i)).toBeInTheDocument();
    });

    it('renders a 6-digit code input', async () => {
        await advanceToCodeStep();
        expect(screen.getByLabelText(/^code$/i)).toBeInTheDocument();
    });

    it('strips non-digits and caps input at 6 characters', async () => {
        await advanceToCodeStep();
        const input = screen.getByLabelText(/^code$/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'a1b2c3d4e5f6g7' } });
        expect(input.value).toBe('123456');
    });

    it('Verify button is disabled until 6 digits are entered', async () => {
        await advanceToCodeStep();
        const verifyBtn = screen.getByRole('button', { name: /^verify$/i });
        expect(verifyBtn).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: '12345' } });
        expect(verifyBtn).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: '123456' } });
        expect(verifyBtn).not.toBeDisabled();
    });

    it('calls verifyOTP with email + code on submit', async () => {
        mockVerifyOTP.mockResolvedValue({});
        await advanceToCodeStep();
        fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: '123456' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^verify$/i }));
        });
        expect(mockVerifyOTP).toHaveBeenCalledWith('me@test.com', '123456');
    });

    it('shows the mapped error message when verifyOTP fails', async () => {
        mockVerifyOTP.mockResolvedValue({ error: "That code didn't match — double-check and try again." });
        await advanceToCodeStep();
        fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: '999999' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^verify$/i }));
        });
        expect(await screen.findByText(/didn't match/i)).toBeInTheDocument();
    });

    it('resend button respects 30s cooldown', async () => {
        await advanceToCodeStep();
        const resend = screen.getByRole('button', { name: /resend/i });
        expect(resend).toBeDisabled();
        expect(resend.textContent).toMatch(/resend in/i);

        for (let i = 0; i < 30; i++) {
            await act(async () => {
                jest.advanceTimersByTime(1000);
            });
        }
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /resend code/i })).not.toBeDisabled();
        });
    });

    it('"Wrong email?" link returns to step 1', async () => {
        await advanceToCodeStep();
        fireEvent.click(screen.getByRole('button', { name: /wrong email/i }));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
        });
    });
});
