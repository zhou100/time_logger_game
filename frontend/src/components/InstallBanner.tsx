import React, { useState } from 'react';
import { Alert, Box, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import IosShareIcon from '@mui/icons-material/IosShare';
import { palette } from '../theme';

const DISMISSED_KEY = 'debrief-install-banner-dismissed';

function isIOSSafari(): boolean {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

function isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
        || ('standalone' in navigator && (navigator as any).standalone === true);
}

const InstallBanner: React.FC = () => {
    const [dismissed, setDismissed] = useState(
        () => localStorage.getItem(DISMISSED_KEY) === '1'
    );

    if (dismissed || !isIOSSafari() || isStandalone()) return null;

    const handleDismiss = () => {
        localStorage.setItem(DISMISSED_KEY, '1');
        setDismissed(true);
    };

    return (
        <Alert
            severity="info"
            icon={false}
            action={
                <IconButton size="small" onClick={handleDismiss} aria-label="Dismiss">
                    <CloseIcon fontSize="small" />
                </IconButton>
            }
            sx={{
                borderRadius: 0,
                bgcolor: palette.surface,
                border: 'none',
                borderBottom: `1px solid ${palette.rule}`,
                py: 1,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IosShareIcon fontSize="small" sx={{ color: palette.info }} />
                <Typography variant="body2">
                    Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> for the full app experience.
                </Typography>
            </Box>
        </Alert>
    );
};

export default InstallBanner;
