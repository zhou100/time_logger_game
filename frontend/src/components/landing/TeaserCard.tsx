import React from 'react';
import { Box, Link, Typography } from '@mui/material';
import { palette } from '../../theme';
import type { DemoTeaser } from '../../services/demoApi';

/**
 * AI Coach letter-pattern card surfaced on the 2nd+ recording when the
 * backend detected a repeated stem. Placement: BELOW the debrief strip — the
 * user reads their just-earned debrief first, then sees the nudge.
 */

interface Props {
    teaser: DemoTeaser;
    /** Click handler for the inline "Sign in →" link. Optional — when omitted, scrolls to the auth footer. */
    onSignInClick?: () => void;
}

const TeaserCard: React.FC<Props> = ({ teaser, onSignInClick }) => {
    return (
        <Box
            sx={{
                pl: 2,
                pr: 2.5,
                py: 2,
                bgcolor: palette.surface,
                borderRadius: '0 8px 8px 0',
                border: `1px solid ${palette.rule}`,
                borderLeftWidth: '3px',
                borderLeftColor: palette.accent,
            }}
        >
            <Typography
                variant="overline"
                component="div"
                sx={{ color: palette.textPrimary, fontWeight: 600, mb: 0.5 }}
            >
                PATTERN FORMING
            </Typography>
            <Typography
                variant="body2"
                sx={{ lineHeight: 1.7, fontStyle: 'italic', color: palette.textPrimary }}
            >
                You’ve mentioned <Box component="span" sx={{ fontWeight: 600 }}>{teaser.stem}</Box>{' '}
                in {teaser.count} debriefs —{' '}
                <Link
                    component="button"
                    type="button"
                    onClick={onSignInClick}
                    sx={{
                        color: palette.accent,
                        fontWeight: 500,
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                    }}
                >
                    sign in →
                </Link>{' '}
                to see the full week.
            </Typography>
        </Box>
    );
};

export default TeaserCard;
