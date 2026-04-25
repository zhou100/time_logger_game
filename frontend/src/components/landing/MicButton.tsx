import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import { palette } from '../../theme';

/**
 * Anti-slop mic button for the interaction-first landing.
 *
 * Per dogfooding feedback the original "no shadow" rule made the button
 * read as illustration rather than a tap surface, so the idle state now
 * carries a flat dark-tone elevation shadow (not a glow halo) and gains
 * hover/pressed affordances. The "no gradient, no glow halo, no Lottie,
 * no waveform" rules from DESIGN.md still hold — the goal of those was
 * to avoid the chatbot-mic look, which a flat elevation does not invoke.
 *
 *   idle       — flat cream fill, vermilion hairline, soft elevation, opacity pulse 2.4s
 *   recording  — flat vermilion fill, cream glyph, inner-ring pulse 0.9s, no shadow
 *   processing — flat cream, animated hairline ring sweep 1.2s, "…" glyph, no shadow
 *   denied     — flat cream, muted-rule border, grey glyph, no shadow
 *   prefers-reduced-motion — pulses/rings disabled, processing uses static dashed border
 *
 * Sizes: 120 mobile / 140 tablet / 160 desktop. Tap target ≥44×44 (these
 * dwarf that). Keyboard: Space and Enter both start/stop.
 */

export type MicState = 'idle' | 'recording' | 'processing' | 'denied';

interface Props {
    state: MicState;
    onTap: () => void;
    /** Adds id used by aria-describedby on the button. */
    descriptionId?: string;
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const m = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(m.matches);
        const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
        // older Safari uses addListener; modern browsers use addEventListener
        if (m.addEventListener) m.addEventListener('change', handler);
        else m.addListener(handler);
        return () => {
            if (m.removeEventListener) m.removeEventListener('change', handler);
            else m.removeListener(handler);
        };
    }, []);
    return reduced;
}

const MicButton: React.FC<Props> = ({ state, onTap, descriptionId }) => {
    const reducedMotion = usePrefersReducedMotion();
    const isPressed = state === 'recording';
    const disabled = state === 'denied';

    const handleKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onTap();
        }
    };

    // ── Visual tokens by state ─────────────────────────────────────────────
    const fillByState: Record<MicState, string> = {
        idle: palette.bg,
        recording: palette.accent,
        processing: palette.bg,
        denied: palette.bg,
    };
    const borderByState: Record<MicState, string> = {
        idle: palette.accent,
        recording: palette.accent,
        processing: palette.accent,
        denied: palette.rule,
    };
    const glyphColorByState: Record<MicState, string> = {
        idle: palette.accent,
        recording: '#F5EDE0',
        processing: palette.accent,
        denied: palette.textMuted,
    };

    // ── Idle pulse — opacity 0.92 ↔ 1.0 over 2.4s ease-in-out ──────────────
    const idleAnim =
        state === 'idle' && !reducedMotion
            ? { animation: 'tlg-mic-idle 2.4s ease-in-out infinite' }
            : {};

    // ── Recording inner ring pulse — opacity 0.85 ↔ 1.0 over 0.9s ──────────
    const innerRing =
        state === 'recording' ? (
            <Box
                aria-hidden="true"
                sx={{
                    position: 'absolute',
                    inset: { xs: 8, sm: 10, md: 12 },
                    borderRadius: '50%',
                    border: '2px solid rgba(245, 237, 224, 0.8)',
                    pointerEvents: 'none',
                    ...(reducedMotion
                        ? {}
                        : { animation: 'tlg-mic-recording-ring 0.9s ease-in-out infinite' }),
                }}
            />
        ) : null;

    // ── Processing: animated single-segment ring sweep, OR static dashed if reduced
    const processingRing =
        state === 'processing' ? (
            reducedMotion ? (
                <Box
                    aria-hidden="true"
                    sx={{
                        position: 'absolute',
                        inset: -2,
                        borderRadius: '50%',
                        border: `1.5px dashed ${palette.accent}`,
                        pointerEvents: 'none',
                    }}
                />
            ) : (
                <Box
                    aria-hidden="true"
                    sx={{
                        position: 'absolute',
                        inset: -2,
                        borderRadius: '50%',
                        // single arc rendered via conic-gradient + mask so we don't
                        // reach for SVGs or third-party animation libs
                        background: `conic-gradient(${palette.accent} 0deg, ${palette.accent} 80deg, transparent 80deg, transparent 360deg)`,
                        WebkitMask:
                            'radial-gradient(circle, transparent calc(50% - 2px), black calc(50% - 2px), black 50%, transparent 50%)',
                        mask: 'radial-gradient(circle, transparent calc(50% - 2px), black calc(50% - 2px), black 50%, transparent 50%)',
                        animation: 'tlg-mic-processing-spin 1.2s linear infinite',
                        pointerEvents: 'none',
                    }}
                />
            )
        ) : null;

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
            }}
        >
            {/* Keyframes — scoped, no global CSS file in this codebase */}
            <Box
                component="style"
                dangerouslySetInnerHTML={{
                    __html: `
                        @keyframes tlg-mic-idle {
                            0%, 100% { opacity: 0.92; }
                            50% { opacity: 1; }
                        }
                        @keyframes tlg-mic-recording-ring {
                            0%, 100% { opacity: 0.85; transform: scale(1); }
                            50% { opacity: 1; transform: scale(1.04); }
                        }
                        @keyframes tlg-mic-processing-spin {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                        }
                    `,
                }}
            />
            <Box
                component="button"
                type="button"
                role="button"
                aria-pressed={isPressed}
                aria-label="Tap to speak your day"
                aria-describedby={descriptionId}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => !disabled && onTap()}
                onKeyDown={handleKey}
                data-state={state}
                sx={{
                    width: { xs: 120, sm: 140, md: 160 },
                    height: { xs: 120, sm: 140, md: 160 },
                    minWidth: 44,
                    minHeight: 44,
                    borderRadius: '50%',
                    bgcolor: fillByState[state],
                    border: `1.5px solid ${borderByState[state]}`,
                    color: glyphColorByState[state],
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    p: 0,
                    position: 'relative',
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: '"DM Sans", sans-serif',
                    fontSize: '2rem',
                    // Idle gets a soft dark-tone elevation so the button reads as
                    // a tap surface rather than a flat illustration. Other states
                    // suppress the shadow — recording is its own visual event,
                    // processing should feel inert, denied should not invite tap.
                    boxShadow:
                        state === 'idle'
                            ? '0 2px 8px rgba(32, 24, 21, 0.10)'
                            : 'none',
                    transition:
                        'background-color 150ms ease-in-out, border-color 150ms ease-in-out, color 150ms ease-in-out, box-shadow 150ms ease-in-out, transform 120ms ease-out',
                    ...idleAnim,
                    '&:hover': !disabled && state === 'idle'
                        ? {
                              boxShadow: '0 4px 14px rgba(32, 24, 21, 0.14)',
                              transform: 'translateY(-1px)',
                          }
                        : undefined,
                    '&:active': !disabled
                        ? {
                              transform:
                                  state === 'idle'
                                      ? 'translateY(0) scale(0.97)'
                                      : 'scale(0.97)',
                              boxShadow:
                                  state === 'idle'
                                      ? '0 1px 4px rgba(32, 24, 21, 0.10)'
                                      : 'none',
                          }
                        : undefined,
                    '&:focus-visible': {
                        outline: `2px solid ${palette.accent}`,
                        outlineOffset: '2px',
                    },
                    '&:disabled': {
                        opacity: 1, // we manage muted look through colors above
                    },
                    '@media (prefers-reduced-motion: reduce)': {
                        transition: 'background-color 150ms, border-color 150ms, color 150ms',
                        '&:hover, &:active': {
                            transform: 'none',
                        },
                    },
                }}
            >
                {state === 'processing' ? (
                    <Typography
                        component="span"
                        aria-hidden="true"
                        sx={{
                            fontFamily: '"DM Sans", sans-serif',
                            fontSize: '2rem',
                            lineHeight: 1,
                            color: palette.accent,
                        }}
                    >
                        …
                    </Typography>
                ) : (
                    <MicIcon aria-hidden="true" sx={{ fontSize: { xs: 40, sm: 48, md: 56 } }} />
                )}
                {innerRing}
                {processingRing}
            </Box>
        </Box>
    );
};

export default MicButton;
