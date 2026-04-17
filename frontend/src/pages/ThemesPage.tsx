import React, { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Alert,
    Box,
    CircularProgress,
    Container,
    IconButton,
    Stack,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { entriesApi } from '../services/api';
import { Theme } from '../types/api';
import { palette } from '../theme';

const polarityColor = (p: string) =>
    p === 'positive' ? palette.success : p === 'negative' ? palette.error : palette.textMuted;

const ThemesPage: React.FC = () => {
    const [themes, setThemes] = useState<Theme[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    const load = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const rows = await entriesApi.listThemes();
            setThemes(rows);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load themes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const dismiss = useCallback(async (t: Theme) => {
        try {
            await entriesApi.updateTheme(t.id, { status: 'dismissed' });
            setThemes((prev) => prev.filter((x) => x.id !== t.id));
        } catch { /* noop */ }
    }, []);

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 3, md: 5 } }}>
            <Stack spacing={3}>
                <Box>
                    <Box
                        component={RouterLink}
                        to="/week"
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            color: palette.textMuted,
                            textDecoration: 'none',
                            fontSize: 12,
                            mb: 1.5,
                            '&:hover': { color: palette.textPrimary },
                        }}
                    >
                        <ArrowBackIcon sx={{ fontSize: 14 }} />
                        Back to week
                    </Box>
                    <Typography variant="overline" color="text.secondary">
                        Recurring Themes
                    </Typography>
                    <Typography variant="h3" sx={{ mt: 0.5, mb: 0.5 }}>
                        Threads running through your weeks
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Patterns the coach has noticed across recent reviews.
                    </Typography>
                </Box>

                {error && <Alert severity="error">{error}</Alert>}

                {loading ? (
                    <Box sx={{ minHeight: '20vh', display: 'grid', placeItems: 'center' }}>
                        <CircularProgress size={28} />
                    </Box>
                ) : themes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                        No active themes yet. Generate a weekly report and the coach will start finding threads.
                    </Typography>
                ) : (
                    <Box
                        sx={{
                            border: `1px solid ${palette.rule}`,
                            borderRadius: '12px',
                            bgcolor: 'background.paper',
                            px: { xs: 2, md: 3 },
                        }}
                    >
                        {themes.map((t) => (
                            <Box
                                key={t.id}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 1.25,
                                    py: 1.75,
                                    borderBottom: `1px solid ${palette.rule}40`,
                                    '&:last-child': { borderBottom: 'none' },
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        bgcolor: polarityColor(t.polarity),
                                        flexShrink: 0,
                                        mt: '8px',
                                    }}
                                />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body1" sx={{ fontWeight: 500, lineHeight: 1.4, mb: 0.25 }}>
                                        {t.title}
                                    </Typography>
                                    {t.description && (
                                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, mb: 0.5 }}>
                                            {t.description}
                                        </Typography>
                                    )}
                                    <Typography variant="caption" color="text.secondary">
                                        Seen {t.occurrences} {t.occurrences === 1 ? 'time' : 'times'}
                                        {t.status === 'pinned' ? ' · pinned' : ''}
                                    </Typography>
                                </Box>
                                <IconButton
                                    size="small"
                                    onClick={() => dismiss(t)}
                                    aria-label="dismiss theme"
                                    sx={{ p: 0.25, flexShrink: 0, color: palette.textMuted, opacity: 0.35, '&:hover': { opacity: 0.8 } }}
                                >
                                    <CloseIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Box>
                        ))}
                    </Box>
                )}
            </Stack>
        </Container>
    );
};

export default ThemesPage;
