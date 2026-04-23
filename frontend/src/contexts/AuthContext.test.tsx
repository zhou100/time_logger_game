/**
 * Tests for AuthContext.mapAuthError — pure function that maps Supabase
 * AuthError messages to user-facing strings. Single source of truth for
 * auth error copy across the app.
 *
 * The AuthContext hook methods (sendOTP, verifyOTP, loginWithGoogle) are
 * thin pass-throughs to supabase-js. Their integration is covered indirectly
 * via SignInForm.test.tsx (which mocks useAuth and asserts the right method
 * is invoked with the right args).
 */
import { mapAuthError } from './AuthContext';

describe('mapAuthError', () => {
    it('maps expired tokens', () => {
        expect(mapAuthError(new Error('Token has expired'))).toMatch(/expired/i);
        expect(mapAuthError(new Error('otp_expired')))
            .toMatch(/expired/i);
    });

    it('maps invalid OTP', () => {
        expect(mapAuthError(new Error('Invalid otp'))).toMatch(/wrong/i);
    });

    it('maps rate limit errors', () => {
        expect(mapAuthError(new Error('Email rate limit exceeded')))
            .toMatch(/too many/i);
        expect(mapAuthError(new Error('too many requests'))).toMatch(/too many/i);
    });

    it('maps network failures', () => {
        expect(mapAuthError(new Error('Failed to fetch'))).toMatch(/connection/i);
    });

    it('maps invalid email', () => {
        expect(mapAuthError(new Error('Invalid email format'))).toMatch(/invalid/i);
    });

    it('falls back to generic message on null or undefined', () => {
        expect(mapAuthError(null)).toMatch(/something went wrong/i);
        expect(mapAuthError(undefined)).toMatch(/something went wrong/i);
    });

    it('passes through unrecognized error messages', () => {
        expect(mapAuthError(new Error('some unknown issue'))).toBe('some unknown issue');
    });

    it('handles an error with empty message', () => {
        expect(mapAuthError(new Error(''))).toMatch(/something went wrong/i);
    });
});
