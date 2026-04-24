import React, { useState } from 'react';
import { Button, CircularProgress } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Google-branded sign-in button.
 *
 * Per Google brand guidelines: white background, #DADCE0 border, blue G logo,
 * #3C4043 text. Recognizable across the web; builds trust via familiarity.
 * Intentionally does NOT use the app's vermilion theme — users click what they
 * know.
 */
interface Props {
    variant?: 'landing' | 'form';
    label?: string;
    onError?: (message: string) => void;
}

const GoogleG: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2582h2.9087c1.7018-1.5668 2.6836-3.8745 2.6836-6.6151z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2582c-.8059.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5831-5.0364-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"/>
        <path fill="#FBBC05" d="M3.9636 10.71c-.18-.54-.2823-1.1168-.2823-1.71 0-.5932.1023-1.17.2823-1.71V4.9582H.9573A8.9966 8.9966 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.9636 10.71z"/>
        <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9636 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"/>
    </svg>
);

const GoogleSignInButton: React.FC<Props> = ({ variant = 'form', label, onError }) => {
    const { loginWithGoogle } = useAuth();
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        setLoading(true);
        try {
            await loginWithGoogle();
            // On success, Supabase redirects; this component unmounts.
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Google sign-in failed.';
            onError?.(message);
            setLoading(false);
        }
    };

    return (
        <Button
            onClick={handleClick}
            disabled={loading}
            fullWidth
            size={variant === 'landing' ? 'large' : 'medium'}
            startIcon={loading ? <CircularProgress size={16} /> : <GoogleG />}
            sx={{
                // Google brand spec — intentionally does NOT use theme palette.
                bgcolor: '#FFFFFF',
                color: '#3C4043',
                border: '1px solid #DADCE0',
                textTransform: 'none',
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: 500,
                fontSize: variant === 'landing' ? '0.95rem' : '0.9rem',
                height: variant === 'landing' ? 48 : 44,
                borderRadius: '8px',
                boxShadow: 'none',
                '&:hover': {
                    bgcolor: '#F8F9FA',
                    borderColor: '#DADCE0',
                    boxShadow: 'none',
                },
                '&:disabled': {
                    bgcolor: '#FFFFFF',
                    color: '#3C4043',
                    opacity: 0.7,
                },
            }}
            aria-label="Sign in with Google"
        >
            {loading ? 'Signing in…' : label ?? 'Sign in with Google'}
        </Button>
    );
};

export default GoogleSignInButton;
