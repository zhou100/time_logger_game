import React from 'react';
import { Box, Dialog, IconButton, Link, Typography } from '@mui/material';
import { palette } from '../../theme';
import AuthFooter from './AuthFooter';
import { capture as captureEvent } from '../../services/analytics';

/**
 * Sign-in gate that opens after the user has seen one real debrief and taps
 * the mic again. Reuses AuthFooter so the Google + magic-link visuals match
 * the post-debrief footer the user has already seen on the page.
 *
 *   tap → recState='done' && classifications.length>=1 → gate opens
 *   user signs in → /welcome claims the demo session → recording history
 *   user dismisses → debrief stays visible, next tap re-opens this gate
 */

interface Props {
    open: boolean;
    onDismiss: () => void;
}

const SignInGate: React.FC<Props> = ({ open, onDismiss }) => {
    React.useEffect(() => {
        if (open) captureEvent('signin_gate_shown');
    }, [open]);

    const handleDismiss = () => {
        captureEvent('signin_gate_dismissed');
        onDismiss();
    };

    return (
        <Dialog
            open={open}
            onClose={handleDismiss}
            fullWidth
            maxWidth="xs"
            aria-labelledby="signin-gate-title"
            PaperProps={{
                sx: {
                    bgcolor: palette.surface,
                    backgroundImage: 'none',
                    p: 0,
                },
            }}
        >
            <Box sx={{ position: 'relative', px: 3, pt: 4, pb: 1 }}>
                <IconButton
                    aria-label="Close"
                    onClick={handleDismiss}
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        color: palette.textMuted,
                    }}
                >
                    {/* Plain × glyph — avoids pulling in another icon package. */}
                    <Box component="span" sx={{ fontSize: 22, lineHeight: 1 }}>
                        ×
                    </Box>
                </IconButton>

                <Typography
                    id="signin-gate-title"
                    variant="h5"
                    sx={{
                        fontFamily: '"DM Serif Display", serif',
                        color: palette.textPrimary,
                        textAlign: 'center',
                        mb: 1,
                    }}
                >
                    Save this debrief to keep going
                </Typography>
                <Typography
                    variant="body2"
                    sx={{
                        color: palette.textMuted,
                        textAlign: 'center',
                        mb: 1,
                    }}
                >
                    Sign in once and your debriefs stick around. Patterns build
                    up across days. No password to remember.
                </Typography>
            </Box>

            {/* AuthFooter handles Google + magic-link and threads the claim
                token through /welcome — same flow as the static landing
                footer, just inside a modal. */}
            <AuthFooter sticky={false} />

            <Box sx={{ textAlign: 'center', pb: 3 }}>
                <Link
                    component="button"
                    type="button"
                    onClick={handleDismiss}
                    sx={{
                        color: palette.textMuted,
                        fontSize: '0.875rem',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                    }}
                >
                    View your debrief
                </Link>
            </Box>
        </Dialog>
    );
};

export default SignInGate;
