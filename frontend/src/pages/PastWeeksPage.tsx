import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Container,
    IconButton,
    Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { entriesApi } from '../services/api';
import { WeeklyAuditHistoryItem } from '../types/api';
import { palette } from '../theme';

const PastWeeksPage: React.FC = () => {
    const navigate = useNavigate();
    const [history, setHistory] = useState<WeeklyAuditHistoryItem[]>([]);

    useEffect(() => {
        entriesApi.getWeeklyAuditHistory(50).then(setHistory).catch(() => {});
    }, []);

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: { xs: 2, md: 4 }, mb: 8 }}>
                {/* ── Header ────────────────────────────────────────── */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 3 }}>
                    <IconButton size="small" onClick={() => navigate('/week')} aria-label="Back to this week">
                        <ChevronLeftIcon />
                    </IconButton>
                    <Typography variant="overline" color="text.secondary">
                        Past Weeks
                    </Typography>
                </Box>

                {/* ── List ──────────────────────────────────────────── */}
                {history.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                        No past reviews yet.
                    </Typography>
                ) : (
                    history.map((item) => {
                        // Extract first sentence as summary
                        const summary = item.audit_text
                            ? item.audit_text.split(/[.\n]/).filter(Boolean)[0]?.trim() ?? ''
                            : '';

                        return (
                            <Box
                                key={item.audit_date}
                                onClick={() => navigate(`/weeks/${item.audit_date}`)}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    py: 1.5,
                                    borderBottom: `1px solid ${palette.rule}40`,
                                    cursor: 'pointer',
                                    mx: -0.5,
                                    px: 0.5,
                                    borderRadius: '4px',
                                    WebkitTapHighlightColor: 'transparent',
                                    transition: 'background-color 0.1s',
                                    '&:active': { bgcolor: `${palette.rule}20` },
                                    '@media (hover: hover)': {
                                        '&:hover': { bgcolor: `${palette.rule}15` },
                                    },
                                }}
                            >
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4 }}>
                                        {item.week_label}
                                    </Typography>
                                    {summary && (
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{
                                                display: 'block',
                                                lineHeight: 1.4,
                                                mt: 0.25,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {summary}
                                        </Typography>
                                    )}
                                    <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.6, mt: 0.25, display: 'block' }}>
                                        {item.entries} entries
                                    </Typography>
                                </Box>
                                <ChevronRightIcon sx={{ fontSize: 18, color: palette.textMuted, opacity: 0.4, flexShrink: 0, ml: 1 }} />
                            </Box>
                        );
                    })
                )}
            </Box>
        </Container>
    );
};

export default PastWeeksPage;
