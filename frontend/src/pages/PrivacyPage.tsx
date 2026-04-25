import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Container, Link, Typography } from '@mui/material';
import { palette } from '../theme';

/**
 * /privacy — static disclosure for the anonymous demo + signed-in retention.
 *
 * Unauthenticated, accessible from the landing page's PII disclosure link.
 * Journal-voiced; no "AI/smart/intelligent" copy. Plain prose, no card boxes
 * around each bullet — this is a privacy notice, not a feature page.
 */

const headingSx = {
    fontFamily: '"DM Serif Display", serif',
    fontWeight: 400,
    color: palette.textPrimary,
    mt: 4,
    mb: 1,
};

const bodySx = {
    color: palette.textPrimary,
    lineHeight: 1.7,
    fontSize: '15px',
};

const PrivacyPage: React.FC = () => {
    return (
        <Container
            maxWidth={false}
            sx={{
                width: '100%',
                maxWidth: { xs: 360, sm: 520, md: 640 },
                mx: 'auto',
                px: { xs: 2, md: 0 },
                pt: { xs: 4, md: 6 },
                pb: { xs: 6, md: 8 },
            }}
        >
            <Typography
                variant="h1"
                component="h1"
                sx={{
                    fontFamily: '"DM Serif Display", serif',
                    fontWeight: 400,
                    color: palette.textPrimary,
                    mb: 1,
                }}
            >
                Privacy
            </Typography>
            <Typography
                variant="body2"
                sx={{ color: palette.textMuted, mb: 2 }}
            >
                What we keep, where it goes, and how long it stays.
            </Typography>

            <Box component="section">
                <Typography variant="h3" component="h2" sx={headingSx}>
                    24-hour retention
                </Typography>
                <Typography sx={bodySx}>
                    Anonymous demo recordings, transcripts, and derived debriefs
                    are deleted automatically 24 hours after creation unless you
                    sign in to save them. Once saved, the app's general retention
                    rules apply.
                </Typography>
            </Box>

            <Box component="section">
                <Typography variant="h3" component="h2" sx={headingSx}>
                    OpenAI processing
                </Typography>
                <Typography sx={bodySx}>
                    Recordings are sent to OpenAI Whisper for transcription and
                    to GPT-4o-mini for summarization. Per OpenAI's API policy,
                    content sent through the API is not used to train their
                    models.
                </Typography>
            </Box>

            <Box component="section">
                <Typography variant="h3" component="h2" sx={headingSx}>
                    IP addresses
                </Typography>
                <Typography sx={bodySx}>
                    We never store raw IPs. They're hashed (SHA-256 with a
                    per-environment salt) only for rate limiting and abuse
                    logs, kept 14 days.
                </Typography>
            </Box>

            <Box component="section">
                <Typography variant="h3" component="h2" sx={headingSx}>
                    No persistent anonymous account
                </Typography>
                <Typography sx={bodySx}>
                    A 24-hour cookie groups your demo recordings together so
                    you can save them at sign-in. If you don't sign in, the
                    cookie expires and there's no record of you.
                </Typography>
            </Box>

            <Box sx={{ mt: 5 }}>
                <Link
                    component={RouterLink}
                    to="/"
                    sx={{
                        color: palette.accent,
                        fontFamily: '"DM Sans", sans-serif',
                        fontWeight: 500,
                        fontSize: '0.95rem',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                    }}
                >
                    ← Back to landing
                </Link>
            </Box>
        </Container>
    );
};

export default PrivacyPage;
