import React from 'react';
import { Box, Typography } from '@mui/material';
import { palette } from '../../theme';

/**
 * "Try saying…" chips. Three hardcoded journal-voice prompts.
 *
 * Tapping a chip:
 *   - Announces the phrase to the sr-live region (caller wires this via
 *     `onSpeak`).
 *   - Triggers `onStartRecording` so visitors without mic muscle memory still
 *     convert.
 *
 * Spec: <button> elements (NOT role="button" divs). Italic body2,
 * paper-card outlined.
 */

export const TRY_SAYING_PROMPTS: string[] = [
    'Today was chaotic but I think I actually got something done.',
    'I keep getting distracted and I don’t know why.',
    'I need to tell Sarah we should push the launch back.',
];

interface Props {
    onSpeak: (phrase: string) => void;
    onStartRecording: () => void;
    /** Disable chips while recording / processing — taps would be lost. */
    disabled?: boolean;
}

const TrySayingChips: React.FC<Props> = ({ onSpeak, onStartRecording, disabled }) => {
    const handleTap = (phrase: string) => {
        if (disabled) return;
        onSpeak(phrase);
        onStartRecording();
    };

    return (
        <Box>
            <Typography
                variant="overline"
                component="div"
                sx={{
                    color: palette.textMuted,
                    mb: 1.5,
                    textAlign: 'center',
                    fontWeight: 600,
                }}
            >
                TRY SAYING
            </Typography>
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    alignItems: 'stretch',
                }}
            >
                {TRY_SAYING_PROMPTS.map((phrase) => (
                    <Box
                        key={phrase}
                        component="button"
                        type="button"
                        onClick={() => handleTap(phrase)}
                        disabled={disabled}
                        sx={{
                            font: 'inherit',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            background: palette.surface,
                            border: `1px solid ${palette.rule}`,
                            borderRadius: '8px',
                            color: palette.textPrimary,
                            fontFamily: '"DM Sans", sans-serif',
                            fontSize: '14px',
                            fontStyle: 'italic',
                            lineHeight: 1.6,
                            px: 2,
                            py: 1.25,
                            minHeight: 44,
                            transition: 'background-color 100ms ease-in-out, border-color 100ms ease-in-out',
                            '&:hover:not(:disabled)': {
                                background: palette.surface2,
                                borderColor: palette.textMuted,
                            },
                            '&:focus-visible': {
                                outline: `2px solid ${palette.accent}`,
                                outlineOffset: '2px',
                            },
                            '&:disabled': {
                                opacity: 0.6,
                            },
                        }}
                    >
                        “{phrase}”
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

export default TrySayingChips;
