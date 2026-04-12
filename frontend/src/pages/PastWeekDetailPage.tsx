import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Box,
    Container,
    IconButton,
    Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { entriesApi } from '../services/api';
import { WeeklyAuditHistoryItem } from '../types/api';
import { palette } from '../theme';

const PastWeekDetailPage: React.FC = () => {
    const navigate = useNavigate();
    const { auditDate } = useParams<{ auditDate: string }>();
    const [item, setItem] = useState<WeeklyAuditHistoryItem | null>(null);

    useEffect(() => {
        if (!auditDate) return;
        entriesApi.getWeeklyAuditHistory(50).then((history) => {
            const found = history.find((h) => h.audit_date === auditDate);
            setItem(found ?? null);
        }).catch(() => {});
    }, [auditDate]);

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: { xs: 2, md: 4 }, mb: 8 }}>
                {/* ── Header ────────────────────────────────────────── */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 3 }}>
                    <IconButton size="small" onClick={() => navigate('/weeks')} aria-label="Back to past weeks">
                        <ChevronLeftIcon />
                    </IconButton>
                    <Typography variant="overline" color="text.secondary">
                        {item?.week_label ?? 'Week Review'}
                    </Typography>
                </Box>

                {!item ? (
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                        Review not found.
                    </Typography>
                ) : (
                    <>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            {item.entries} entries · generated {item.generated_at
                                ? new Date(item.generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                : ''}
                        </Typography>
                        <Typography
                            variant="body1"
                            sx={{
                                whiteSpace: 'pre-wrap',
                                lineHeight: 1.7,
                                fontSize: '15px',
                                color: palette.textPrimary,
                            }}
                        >
                            {item.audit_text}
                        </Typography>
                    </>
                )}
            </Box>
        </Container>
    );
};

export default PastWeekDetailPage;
