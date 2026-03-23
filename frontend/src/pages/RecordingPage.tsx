import React, { useState, useCallback } from 'react';
import {
    Container,
    Box,
    Typography,
    Paper,
    LinearProgress,
    Grid,
    Card,
    CardContent,
    Badge,
    Chip,
    Alert,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RecordButton from '../components/RecordButton';
import TranscriptionDisplay from '../components/TranscriptionDisplay';
import { useStats } from '../hooks/useStats';
import { useEntries, useEntryStatus } from '../hooks/useEntries';
import { useUpload } from '../hooks/useUpload';
import { useWebSocket } from '../hooks/useWebSocket';
import Logger from '../utils/logger';

const RecordingPage: React.FC = () => {
    // Connect WebSocket for real-time updates
    useWebSocket();

    const { data: stats, isLoading: statsLoading } = useStats();
    const { data: entriesData } = useEntries(0, 10);
    const upload = useUpload();

    const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
    const [error, setError] = useState<string | undefined>();

    // Poll the status of the most recently submitted entry
    const { data: entryStatus } = useEntryStatus(pendingEntryId);

    const transcript = entryStatus?.transcript ?? null;
    const isProcessing =
        upload.isPending ||
        (!!pendingEntryId &&
            entryStatus?.status !== 'done' &&
            entryStatus?.status !== 'failed');

    const handleRecordingComplete = useCallback(
        async (blob: Blob) => {
            setError(undefined);
            setPendingEntryId(null);
            try {
                Logger.info('Starting two-phase upload');
                const { entry_id } = await upload.mutateAsync({
                    blob,
                    options: { recordedAt: new Date().toISOString() },
                });
                setPendingEntryId(entry_id);
                Logger.info(`Entry ${entry_id} submitted for processing`);
            } catch (err) {
                Logger.error('Upload failed:', err);
                setError(err instanceof Error ? err.message : 'Upload failed');
            }
        },
        [upload]
    );

    // Stats with sensible fallbacks while loading
    const totalRecordings = stats?.total_entries ?? 0;
    const totalMinutes = stats?.total_minutes_logged ?? 0;
    const streak = stats?.current_streak ?? 0;
    const level = stats?.level ?? 1;
    const xp = stats?.xp ?? 0;
    const xpToNext = stats?.xp_to_next_level ?? 100;
    const levelProgress = Math.round((xp % 100) / (xpToNext + (xp % 100)) * 100) || 0;

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: 4, mb: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography
                    variant="h3"
                    component="h1"
                    gutterBottom
                    sx={{
                        fontWeight: 'bold',
                        background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                        backgroundClip: 'text',
                        textFillColor: 'transparent',
                        mb: 4,
                    }}
                >
                    Time Logger
                </Typography>

                {/* ── Stats cards ─────────────────────────────────────────────── */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} sm={4}>
                        <Card sx={{ height: '100%' }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Badge
                                    badgeContent={<EmojiEventsIcon sx={{ fontSize: 16 }} />}
                                    color="primary"
                                    sx={{ '& .MuiBadge-badge': { width: 22, height: 22, borderRadius: '50%' } }}
                                >
                                    <Typography variant="h4" color="primary">{totalRecordings}</Typography>
                                </Badge>
                                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                                    Total Recordings
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Card sx={{ height: '100%' }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Badge
                                    badgeContent={<AccessTimeIcon sx={{ fontSize: 16 }} />}
                                    color="secondary"
                                    sx={{ '& .MuiBadge-badge': { width: 22, height: 22, borderRadius: '50%' } }}
                                >
                                    <Typography variant="h4" color="secondary">{totalMinutes}</Typography>
                                </Badge>
                                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                                    Minutes Logged
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Card sx={{ height: '100%' }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Badge
                                    badgeContent={<TrendingUpIcon sx={{ fontSize: 16 }} />}
                                    color="success"
                                    sx={{ '& .MuiBadge-badge': { width: 22, height: 22, borderRadius: '50%' } }}
                                >
                                    <Typography variant="h4" color="success.main">{streak}</Typography>
                                </Badge>
                                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                                    Day Streak
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                {/* ── Level progress ───────────────────────────────────────────── */}
                <Box sx={{ width: '100%', mb: 4 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" color="textSecondary">
                            Level {level}
                        </Typography>
                        <Typography variant="body2" color="primary">
                            {xp} XP — {xpToNext} to next level
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={levelProgress}
                        sx={{
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: 'rgba(0,0,0,0.1)',
                            '& .MuiLinearProgress-bar': {
                                borderRadius: 4,
                                backgroundImage: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                            },
                        }}
                    />
                </Box>

                {/* ── Recorder ─────────────────────────────────────────────────── */}
                <Paper
                    elevation={3}
                    sx={{
                        p: 4,
                        width: '100%',
                        borderRadius: 2,
                        background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
                    }}
                >
                    <RecordButton onRecordingComplete={handleRecordingComplete} />

                    {/* Processing step indicator */}
                    {isProcessing && entryStatus?.step && (
                        <Box sx={{ mt: 2, textAlign: 'center' }}>
                            <Chip
                                label={stepLabel(entryStatus.step)}
                                color="primary"
                                size="small"
                                variant="outlined"
                            />
                        </Box>
                    )}

                    <TranscriptionDisplay
                        transcription={transcript}
                        isLoading={isProcessing}
                        error={error ?? (entryStatus?.status === 'failed' ? 'Processing failed. Please try again.' : undefined)}
                    />

                    {/* Category chip once classified */}
                    {entryStatus?.status === 'done' && entryStatus.category && (
                        <Box sx={{ mt: 1, textAlign: 'center' }}>
                            <Chip label={entryStatus.category} color="secondary" size="small" />
                        </Box>
                    )}
                </Paper>

                {/* ── Recent entries ───────────────────────────────────────────── */}
                {entriesData && entriesData.items.length > 0 && (
                    <Box sx={{ width: '100%', mt: 4 }}>
                        <Typography variant="h6" gutterBottom>Recent Entries</Typography>
                        {entriesData.items.slice(0, 5).map((entry) => (
                            <Paper key={entry.id} sx={{ p: 2, mb: 1 }} elevation={1}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <Typography variant="body2" sx={{ flex: 1, mr: 1 }}>
                                        {entry.transcript ?? 'Processing…'}
                                    </Typography>
                                    {entry.category && (
                                        <Chip label={entry.category} size="small" sx={{ flexShrink: 0 }} />
                                    )}
                                </Box>
                                <Typography variant="caption" color="textSecondary">
                                    {new Date(entry.created_at).toLocaleString()}
                                </Typography>
                            </Paper>
                        ))}
                    </Box>
                )}
            </Box>
        </Container>
    );
};

function stepLabel(step: string): string {
    switch (step) {
        case 'queued': return 'Queued…';
        case 'starting': return 'Starting…';
        case 'transcribing': return 'Transcribing audio…';
        case 'classifying': return 'Classifying…';
        case 'complete': return 'Done';
        default: return step;
    }
}

export default RecordingPage;
