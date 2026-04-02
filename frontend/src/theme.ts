import { createTheme } from '@mui/material/styles';

// ── Design tokens from DESIGN.md ────────────────────────────────────────────
const palette = {
    bg: '#F5EDE0',
    surface: '#EBE2D3',
    surface2: '#E0D5C4',
    textPrimary: '#201815',
    textMuted: '#6F6258',
    accent: '#B6492D',
    accentSoft: '#D9A28D',
    accentHover: '#9C3B23',
    rule: '#C4B8A8',
    success: '#5E6B4A',
    warning: '#9C6B2F',
    error: '#A04040',
    info: '#3E5A63',
};

const serif = '"DM Serif Display", "Noto Serif SC", serif';
const sans = '"DM Sans", "Noto Sans SC", sans-serif';

export const CATEGORY_COLORS: Record<string, string> = {
    TODO: '#B6492D',
    IDEA: '#8A5A44',
    THOUGHT: '#6F6258',
    TIME_RECORD: '#3E5A63',
};

export const CATEGORY_LABELS: Record<string, string> = {
    TODO: 'TODO / Deep work',
    IDEA: 'IDEA / Creative',
    THOUGHT: 'THOUGHT / Reflection',
    TIME_RECORD: 'TIME / Logged',
};

export const theme = createTheme({
    palette: {
        primary: {
            main: palette.accent,
            dark: palette.accentHover,
            light: palette.accentSoft,
        },
        secondary: {
            main: palette.info,
        },
        error: {
            main: palette.error,
        },
        warning: {
            main: palette.warning,
        },
        success: {
            main: palette.success,
        },
        info: {
            main: palette.info,
        },
        background: {
            default: palette.bg,
            paper: palette.surface,
        },
        text: {
            primary: palette.textPrimary,
            secondary: palette.textMuted,
        },
        divider: palette.rule,
    },
    typography: {
        fontFamily: sans,
        h1: {
            fontFamily: serif,
            fontSize: '2.5rem',
            fontWeight: 400,
        },
        h2: {
            fontFamily: serif,
            fontSize: '1.75rem',
            fontWeight: 400,
        },
        h3: {
            fontFamily: serif,
            fontSize: '1.25rem',
            fontWeight: 400,
        },
        h4: {
            fontFamily: serif,
            fontSize: '1.125rem',
            fontWeight: 400,
        },
        h5: {
            fontFamily: serif,
            fontSize: '1rem',
            fontWeight: 400,
        },
        h6: {
            fontFamily: serif,
            fontSize: '0.875rem',
            fontWeight: 400,
        },
        body1: {
            fontSize: '15px',
            fontWeight: 400,
        },
        body2: {
            fontSize: '14px',
            fontWeight: 400,
        },
        caption: {
            fontSize: '12px',
            fontWeight: 400,
        },
        overline: {
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
        },
    },
    shape: {
        borderRadius: 8,
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: palette.bg,
                },
            },
        },
        MuiPaper: {
            defaultProps: {
                elevation: 0,
            },
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    border: `1px solid ${palette.rule}`,
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    textTransform: 'none' as const,
                    fontWeight: 500,
                },
                containedPrimary: {
                    '&:hover': {
                        backgroundColor: palette.accentHover,
                    },
                },
                outlinedPrimary: {
                    borderColor: palette.accent,
                    color: palette.accent,
                    '&:hover': {
                        borderColor: palette.accentHover,
                        backgroundColor: 'rgba(182, 73, 45, 0.04)',
                    },
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        borderRadius: 8,
                        '& fieldset': {
                            borderColor: palette.rule,
                        },
                        '&:hover fieldset': {
                            borderColor: palette.textMuted,
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: palette.accent,
                        },
                    },
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 4,
                },
                outlinedPrimary: {
                    borderColor: palette.accent,
                    color: palette.accent,
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: palette.bg,
                    borderBottom: `1px solid ${palette.rule}`,
                },
            },
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: 4,
                },
            },
        },
        MuiLinearProgress: {
            styleOverrides: {
                root: {
                    borderRadius: 4,
                    height: 8,
                    backgroundColor: `${palette.rule}40`,
                },
            },
        },
        MuiDivider: {
            styleOverrides: {
                root: {
                    borderColor: palette.rule,
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    borderRadius: 12,
                },
            },
        },
    },
});

export { palette };
