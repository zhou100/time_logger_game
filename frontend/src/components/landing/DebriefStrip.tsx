import React from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import { palette } from '../../theme';
import type { DemoClassification, DemoFakeOutput } from '../../services/demoApi';

/**
 * Debrief strip: the "what your debrief looks like" panel that doubles as the
 * skeleton during processing and finally the real output.
 *
 * Five visual phases driven by `phase`:
 *   pre-tap   → fake example, overline "EXAMPLE — THIS IS WHAT YOURS WILL LOOK LIKE"
 *   pipeline  → skeleton lines, overline "YOUR DEBRIEF"
 *   done      → real summary + classifications, overline "YOUR DEBRIEF"
 *   error     → skeleton + "Something went wrong. Try again."
 *   capped    → real fake_output (cost cap), overline "YOUR DEBRIEF"
 *
 * Labels are overline-style. Em-dash bullets for Key Points. ☐ glyph for Todos.
 */

export type DebriefPhase = 'pre-tap' | 'pipeline' | 'done' | 'error' | 'capped';

interface Props {
    phase: DebriefPhase;
    /** When phase === 'done', the mechanical summary derived server-side. */
    summary?: string | null;
    /** When phase === 'done', the classified items split into key points / todos. */
    classifications?: DemoClassification[];
    /** When phase === 'capped', the pre-baked fake output. */
    fakeOutput?: DemoFakeOutput | null;
}

const FAKE_EXAMPLE: DemoFakeOutput = {
    summary: 'A distracted day, unsure why.',
    key_points: [
        'Focus kept slipping through the afternoon.',
        'Nothing specific seemed to trigger it.',
    ],
    todos: [
        'Notice what breaks focus next time.',
        'Try a 25-minute block tomorrow morning.',
    ],
};

function splitClassifications(items: DemoClassification[]) {
    const todos: string[] = [];
    const keyPoints: string[] = [];
    for (const item of items) {
        // TODO category surfaces as todos; everything else folds into key points.
        if (item.category && item.category.toUpperCase() === 'TODO') {
            todos.push(item.text);
        } else {
            keyPoints.push(item.text);
        }
    }
    return { todos, keyPoints };
}

const Overline: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography
        variant="overline"
        component="div"
        sx={{ color: palette.textPrimary, fontWeight: 600, mb: 1 }}
    >
        {children}
    </Typography>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography
        variant="overline"
        component="div"
        sx={{
            color: palette.textMuted,
            fontWeight: 600,
            letterSpacing: '0.08em',
            mb: 0.5,
        }}
    >
        {children}
    </Typography>
);

const DebriefStrip: React.FC<Props> = ({ phase, summary, classifications, fakeOutput }) => {
    const headerOverline = phase === 'pre-tap' ? 'YOUR DEBRIEF' : 'YOUR DEBRIEF';

    // ── Resolve the content shown in each phase ───────────────────────────
    let summaryText: string | null = null;
    let keyPoints: string[] = [];
    let todos: string[] = [];
    let showSkeleton = false;
    let errorMessage: string | null = null;

    if (phase === 'pre-tap') {
        summaryText = FAKE_EXAMPLE.summary;
        keyPoints = FAKE_EXAMPLE.key_points;
        todos = FAKE_EXAMPLE.todos;
    } else if (phase === 'pipeline') {
        showSkeleton = true;
    } else if (phase === 'error') {
        showSkeleton = true;
        errorMessage = 'Something went wrong. Try again.';
    } else if (phase === 'done') {
        summaryText = summary ?? null;
        const split = splitClassifications(classifications ?? []);
        keyPoints = split.keyPoints;
        todos = split.todos;
    } else if (phase === 'capped') {
        summaryText = fakeOutput?.summary ?? FAKE_EXAMPLE.summary;
        keyPoints = fakeOutput?.key_points ?? FAKE_EXAMPLE.key_points;
        todos = fakeOutput?.todos ?? FAKE_EXAMPLE.todos;
    }

    return (
        <Box
            sx={{
                bgcolor: palette.surface,
                border: `1px solid ${palette.rule}`,
                borderRadius: '8px',
                p: { xs: 2.5, md: 3 },
                transition: 'opacity 300ms ease-out',
                position: 'relative',
            }}
            data-phase={phase}
        >
            {/* Pre-tap realism row: gives the example the feel of a saved entry
                rather than a static template. Hidden on all other phases —
                the real debrief carries its own implied "just now" freshness. */}
            {phase === 'pre-tap' && (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 2,
                        mb: 1.5,
                        flexWrap: 'wrap',
                    }}
                >
                    <Typography
                        component="div"
                        sx={{
                            fontFamily: '"DM Serif Display", serif',
                            fontSize: '1rem',
                            color: palette.textPrimary,
                            lineHeight: 1.3,
                        }}
                    >
                        Wednesday afternoon debrief
                    </Typography>
                    <Typography
                        component="div"
                        sx={{
                            fontFamily: '"DM Sans", sans-serif',
                            fontSize: '12px',
                            color: palette.textMuted,
                            letterSpacing: '0.02em',
                        }}
                    >
                        Today, 3:24 PM · 28-second entry
                    </Typography>
                </Box>
            )}

            {phase === 'pre-tap' && (
                <Typography
                    component="div"
                    sx={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        fontFamily: '"DM Sans", sans-serif',
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '0.10em',
                        color: palette.textMuted,
                        bgcolor: palette.bg,
                        border: `1px solid ${palette.rule}`,
                        borderRadius: '4px',
                        px: 0.75,
                        py: 0.25,
                        textTransform: 'uppercase',
                    }}
                >
                    Example
                </Typography>
            )}

            {phase !== 'pre-tap' && <Overline>{headerOverline}</Overline>}

            {errorMessage && (
                <Typography
                    variant="body2"
                    sx={{ color: palette.error, mb: 1.5, fontStyle: 'italic' }}
                >
                    {errorMessage}
                </Typography>
            )}

            {/* SUMMARY */}
            <Box sx={{ mb: 2 }}>
                <SectionLabel>SUMMARY</SectionLabel>
                {showSkeleton ? (
                    <Skeleton variant="text" width="80%" height={22} />
                ) : (
                    <Typography
                        variant="body1"
                        sx={{ color: palette.textPrimary, lineHeight: 1.6 }}
                    >
                        {summaryText || '—'}
                    </Typography>
                )}
            </Box>

            {/* KEY POINTS */}
            <Box sx={{ mb: 2 }}>
                <SectionLabel>KEY POINTS</SectionLabel>
                {showSkeleton ? (
                    <>
                        <Skeleton variant="text" width="92%" />
                        <Skeleton variant="text" width="78%" />
                    </>
                ) : (
                    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {keyPoints.length === 0 && (
                            <Typography
                                variant="body2"
                                sx={{ color: palette.textMuted, fontStyle: 'italic' }}
                            >
                                —
                            </Typography>
                        )}
                        {keyPoints.map((point, idx) => (
                            <Box
                                component="li"
                                key={`kp-${idx}`}
                                sx={{
                                    display: 'flex',
                                    gap: 1,
                                    py: 0.5,
                                    color: palette.textPrimary,
                                    fontFamily: '"DM Sans", sans-serif',
                                    fontSize: '14px',
                                    lineHeight: 1.6,
                                }}
                            >
                                <Box
                                    aria-hidden="true"
                                    component="span"
                                    sx={{ color: palette.textMuted, flexShrink: 0 }}
                                >
                                    —
                                </Box>
                                <Box component="span">{point}</Box>
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>

            {/* TODOS */}
            <Box>
                <SectionLabel>TODOS</SectionLabel>
                {showSkeleton ? (
                    <>
                        <Skeleton variant="text" width="85%" />
                        <Skeleton variant="text" width="70%" />
                    </>
                ) : (
                    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {todos.length === 0 && (
                            <Typography
                                variant="body2"
                                sx={{ color: palette.textMuted, fontStyle: 'italic' }}
                            >
                                —
                            </Typography>
                        )}
                        {todos.map((todo, idx) => (
                            <Box
                                component="li"
                                key={`todo-${idx}`}
                                sx={{
                                    display: 'flex',
                                    gap: 1,
                                    py: 0.5,
                                    color: palette.textPrimary,
                                    fontFamily: '"DM Sans", sans-serif',
                                    fontSize: '14px',
                                    lineHeight: 1.6,
                                }}
                            >
                                <Box
                                    aria-hidden="true"
                                    component="span"
                                    sx={{ flexShrink: 0 }}
                                >
                                    ☐
                                </Box>
                                <Box component="span">{todo}</Box>
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default DebriefStrip;
