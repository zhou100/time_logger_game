/**
 * Tests for SignInForm: state machine, OTP entry, resend cooldown, 3-attempt
 * limit, Google button, back-to-email.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignInForm from './SignInForm';

// ── Mocks ─────────────────────────────────────────────────────────────────────
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

// Skip the palette import cycle
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
    it('renders Google button + email field + Send code button', () => {
        renderForm();
        expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send code/i })).toBeInTheDocument();
    });

    it('calls sendOTP on submit and transitions to step 2', async () => {
        mockSendOTP.mockResolvedValue({});
        renderForm();
        const email = screen.getByLabelText(/email/i);
        fireEvent.change(email, { target: { value: 'me@test.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /send code/i }));
        });
        expect(mockSendOTP).toHaveBeenCalledWith('me@test.com');
        await waitFor(() => {
            expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
        });
    });

    it('shows the mapped error message when sendOTP fails', async () => {
        mockSendOTP.mockResolvedValue({ error: 'Too many attempts.' });
        renderForm();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'me@test.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /send code/i }));
        });
        expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    });
});

describe('SignInForm — step 2 (OTP)', () => {
    async function advanceToOtpStep() {
        mockSendOTP.mockResolvedValue({});
        renderForm();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'me@test.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /send code/i }));
        });
        await waitFor(() => {
            expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
        });
    }

    it('auto-submits once 6 digits are entered and navigates on success', async () => {
        mockVerifyOTP.mockResolvedValue({});
        await advanceToOtpStep();
        const otp = screen.getByLabelText(/6-digit code/i);
        await act(async () => {
            fireEvent.change(otp, { target: { value: '123456' } });
        });
        await waitFor(() => {
            expect(mockVerifyOTP).toHaveBeenCalledWith('me@test.com', '123456');
        });
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
        });
    });

    it('strips non-digit characters from OTP input', async () => {
        await advanceToOtpStep();
        const otp = screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
        fireEvent.change(otp, { target: { value: 'ab12-34' } });
        expect(otp.value).toBe('1234');
    });

    it('shows error message and increments attempts on wrong code', async () => {
        mockVerifyOTP.mockResolvedValue({ error: 'That code is wrong. Try again.' });
        await advanceToOtpStep();
        await act(async () => {
            fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '000000' } });
        });
        await waitFor(() => {
            expect(screen.getByText(/that code is wrong/i)).toBeInTheDocument();
        });
    });

    it('disables input after 3 failed attempts', async () => {
        mockVerifyOTP.mockResolvedValue({ error: 'That code is wrong. Try again.' });
        await advanceToOtpStep();
        const otp = () => screen.getByLabelText(/6-digit code/i) as HTMLInputElement;
        for (let i = 0; i < 3; i++) {
            await act(async () => {
                fireEvent.change(otp(), { target: { value: `00000${i}` } });
            });
            await waitFor(() => expect(mockVerifyOTP).toHaveBeenCalledTimes(i + 1));
        }
        expect(otp()).toBeDisabled();
        expect(screen.getByText(/request a new code below/i)).toBeInTheDocument();
    });

    it('resend button respects 30s cooldown', async () => {
        mockSendOTP.mockResolvedValue({});
        await advanceToOtpStep();
        const resend = screen.getByRole('button', { name: /resend/i });
        expect(resend).toBeDisabled();
        expect(resend.textContent).toMatch(/resend in/i);

        // Tick 30s forward — each 1s tick fires a setTimeout, so advance in
        // chunks and let React flush state updates between them.
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
        await advanceToOtpStep();
        fireEvent.click(screen.getByRole('button', { name: /wrong email/i }));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /send code/i })).toBeInTheDocument();
        });
    });

    it('displays the email address in helper text', async () => {
        await advanceToOtpStep();
        expect(screen.getByText('me@test.com')).toBeInTheDocument();
    });
});
