import React, { useCallback, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Container,
    Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { entriesApi } from '../services/api';
import { AuditResponse } from '../types/api';
import { palette } from '../theme';

const ReflectPage: React.FC = () => {
    const [weeklyLoading, setWeeklyLoading] = useState(false);
    const [weeklyResult, setWeeklyResult] = useState<AuditResponse | null>(null);
    const [weeklyError, setWeeklyError] = useState<string | undefined>();

    const handleWeeklyReview = useCallback(async () => {
        const shouldRegenerate = weeklyResult !== null;
        setWeeklyLoading(true);
        setWeeklyError(undefined);
        try {
            const result = await entriesApi.generateWeeklyAudit(shouldRegenerate);
            setWeeklyResult(result);
        } catch (err) {
            setWeeklyError(err instanceof Error ? err.message : 'Weekly review failed');
        } finally {
            setWeeklyLoading(false);
        }
    }, [weeklyResult]);

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: 4, mb: 8 }}>
                <Typography variant="h1" component="h1" gutterBottom sx={{ mb: 2 }}>
                    Reflect
                </Typography>

                {/* Weekly Coach Letter */}
                <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography variant="overline" color="text.secondary">
                            Weekly Coach
                        </Typography>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={weeklyLoading ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
                            onClick={handleWeeklyReview}
                            disabled={weeklyLoading}
                        >
                            {weeklyResult ? 'Regenerate' : 'Generate Weekly Review'}
                        </Button>
                    </Box>

                    {weeklyError && (
                        <Alert severity="error" sx={{ mb: 1 }}>{weeklyError}</Alert>
                    )}

                    {weeklyResult === null && !weeklyLoading && !weeklyError && (
                        <Typography variant="body2" color="text.secondary">
                            Get an honest weekly review comparing your days and calling out patterns.
                        </Typography>
                    )}

                    {weeklyResult?.message && !weeklyResult.audit_text && (
                        <Typography variant="body2" color="text.secondary">
                            {weeklyResult.message}
                        </Typography>
                    )}

                    {weeklyResult?.audit_text && (
                        <Box
                            sx={{
                                borderLeft: `2px solid ${palette.info}`,
                                pl: 2,
                                py: 1,
                                bgcolor: palette.surface2,
                                borderRadius: '0 8px 8px 0',
                            }}
                        >
                            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                Your Weekly Coach says:
                            </Typography>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                                {weeklyResult.audit_text}
                            </Typography>
                            {weeklyResult.generated_at && (
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                                    Based on {weeklyResult.entries} entries this week
                                    {weeklyResult.cached && ' (cached)'}
                                </Typography>
                            )}
                        </Box>
                    )}
                </Box>
            </Box>
        </Container>
    );
};

export default ReflectPage;
