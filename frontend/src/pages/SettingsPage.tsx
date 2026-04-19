import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    FormControl,
    FormHelperText,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { palette } from '../theme';
import { preferencesApi, PreferencesValidationError } from '../services/api';
import {
    CoachingPreferences,
    CoachingTone,
    CoachingPacing,
    CoachingLanguageLock,
} from '../types/api';

const TONE_OPTIONS: { value: CoachingTone; label: string; help: string }[] = [
    { value: 'warm', label: 'Warm', help: 'Encouraging and supportive.' },
    { value: 'direct', label: 'Direct', help: 'Honest, no padding.' },
    { value: 'playful', label: 'Playful', help: 'Light, with some humor.' },
];

const PACING_OPTIONS: { value: CoachingPacing; label: string; help: string }[] = [
    { value: 'actionable', label: 'Actionable', help: 'Concrete next steps.' },
    { value: 'reflective', label: 'Reflective', help: 'Patterns and questions.' },
    { value: 'both', label: 'Both', help: 'Mix of action and reflection.' },
];

const LANGUAGE_OPTIONS: { value: CoachingLanguageLock; label: string }[] = [
    { value: 'auto', label: 'Auto-detect from your entries' },
    { value: 'en', label: 'English only' },
    { value: 'zh', label: '中文 only' },
];

const MAX_TOPICS = 10;
const MAX_TOPIC_LEN = 60;

const SettingsPage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [generalError, setGeneralError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const [tone, setTone] = useState<CoachingTone>('warm');
    const [pacing, setPacing] = useState<CoachingPacing>('actionable');
    const [languageLock, setLanguageLock] = useState<CoachingLanguageLock>('auto');
    const [avoidTopics, setAvoidTopics] = useState<string[]>([]);
    const [topicDraft, setTopicDraft] = useState('');

    const applyPrefs = useCallback((p: CoachingPreferences) => {
        setTone(p.tone);
        setPacing(p.pacing);
        setLanguageLock(p.language_lock);
        setAvoidTopics(p.avoid_topics);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const prefs = await preferencesApi.get();
            applyPrefs(prefs);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'Could not load preferences');
        } finally {
            setLoading(false);
        }
    }, [applyPrefs]);

    useEffect(() => {
        void load();
    }, [load]);

    const addTopic = useCallback(() => {
        const t = topicDraft.trim();
        if (!t) return;
        if (avoidTopics.length >= MAX_TOPICS) return;
        if (avoidTopics.some((x) => x.toLowerCase() === t.toLowerCase())) {
            setTopicDraft('');
            return;
        }
        setAvoidTopics([...avoidTopics, t]);
        setTopicDraft('');
    }, [topicDraft, avoidTopics]);

    const removeTopic = useCallback((idx: number) => {
        setAvoidTopics((prev) => prev.filter((_, i) => i !== idx));
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setGeneralError(null);
        setFieldErrors({});
        try {
            const updated = await preferencesApi.patch({
                tone,
                pacing,
                language_lock: languageLock,
                avoid_topics: avoidTopics,
            });
            applyPrefs(updated);
            setSavedAt(Date.now());
        } catch (e) {
            if (e instanceof PreferencesValidationError) {
                setFieldErrors(e.fields);
                setGeneralError(e.message);
            } else {
                setGeneralError(e instanceof Error ? e.message : 'Could not save preferences');
            }
        } finally {
            setSaving(false);
        }
    }, [tone, pacing, languageLock, avoidTopics, applyPrefs]);

    const handleReset = useCallback(async () => {
        setSaving(true);
        setGeneralError(null);
        setFieldErrors({});
        try {
            const updated = await preferencesApi.patch({
                tone: null,
                pacing: null,
                language_lock: null,
                avoid_topics: null,
            });
            applyPrefs(updated);
            setSavedAt(Date.now());
        } catch (e) {
            setGeneralError(e instanceof Error ? e.message : 'Could not reset preferences');
        } finally {
            setSaving(false);
        }
    }, [applyPrefs]);

    const topicLenErr = useMemo(() => {
        if (topicDraft.length > MAX_TOPIC_LEN) {
            return `Max ${MAX_TOPIC_LEN} characters.`;
        }
        return null;
    }, [topicDraft]);

    if (loading) {
        return (
            <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
                <Stack alignItems="center" spacing={2}>
                    <CircularProgress size={24} />
                    <Typography variant="body2" color="text.secondary">
                        Loading your preferences...
                    </Typography>
                </Stack>
            </Container>
        );
    }

    if (loadError) {
        return (
            <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
                <Alert
                    severity="error"
                    action={
                        <Button color="inherit" size="small" onClick={load}>
                            Retry
                        </Button>
                    }
                >
                    {loadError}
                </Alert>
            </Container>
        );
    }

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
                        Coaching settings
                    </Typography>
                    <Typography variant="h3" sx={{ mt: 0.5, mb: 0.5 }}>
                        How your weekly review sounds
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Tune the voice and pacing of your weekly audit. Changes apply to the next
                        report you generate.
                    </Typography>
                </Box>

                {generalError && (
                    <Alert severity="error" onClose={() => setGeneralError(null)}>
                        {generalError}
                    </Alert>
                )}
                {savedAt && !generalError && (
                    <Alert severity="success" onClose={() => setSavedAt(null)}>
                        Preferences saved. Generate a new weekly report to see the change.
                    </Alert>
                )}

                <FormControl fullWidth error={Boolean(fieldErrors.tone)}>
                    <InputLabel id="tone-label">Tone</InputLabel>
                    <Select
                        labelId="tone-label"
                        label="Tone"
                        value={tone}
                        onChange={(e) => setTone(e.target.value as CoachingTone)}
                    >
                        {TONE_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                                <Box>
                                    <Typography variant="body2">{opt.label}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {opt.help}
                                    </Typography>
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                    {fieldErrors.tone && <FormHelperText>{fieldErrors.tone}</FormHelperText>}
                </FormControl>

                <FormControl fullWidth error={Boolean(fieldErrors.pacing)}>
                    <InputLabel id="pacing-label">Pacing</InputLabel>
                    <Select
                        labelId="pacing-label"
                        label="Pacing"
                        value={pacing}
                        onChange={(e) => setPacing(e.target.value as CoachingPacing)}
                    >
                        {PACING_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                                <Box>
                                    <Typography variant="body2">{opt.label}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {opt.help}
                                    </Typography>
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                    {fieldErrors.pacing && <FormHelperText>{fieldErrors.pacing}</FormHelperText>}
                </FormControl>

                <FormControl fullWidth error={Boolean(fieldErrors.language_lock)}>
                    <InputLabel id="lang-label">Language</InputLabel>
                    <Select
                        labelId="lang-label"
                        label="Language"
                        value={languageLock}
                        onChange={(e) => setLanguageLock(e.target.value as CoachingLanguageLock)}
                    >
                        {LANGUAGE_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </MenuItem>
                        ))}
                    </Select>
                    {fieldErrors.language_lock && (
                        <FormHelperText>{fieldErrors.language_lock}</FormHelperText>
                    )}
                </FormControl>

                <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                        Topics to avoid giving advice on
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        Up to {MAX_TOPICS}. The coach can still note these came up, but won't
                        prescribe what to do.
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                        <TextField
                            size="small"
                            value={topicDraft}
                            onChange={(e) => setTopicDraft(e.target.value)}
                            placeholder="e.g. sleep, weight"
                            disabled={avoidTopics.length >= MAX_TOPICS}
                            error={Boolean(topicLenErr)}
                            helperText={topicLenErr || undefined}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addTopic();
                                }
                            }}
                            sx={{ flex: 1 }}
                        />
                        <Button
                            variant="outlined"
                            onClick={addTopic}
                            disabled={
                                !topicDraft.trim() ||
                                avoidTopics.length >= MAX_TOPICS ||
                                Boolean(topicLenErr)
                            }
                        >
                            Add
                        </Button>
                    </Stack>
                    {fieldErrors.avoid_topics && (
                        <FormHelperText error sx={{ mt: 1 }}>
                            {fieldErrors.avoid_topics}
                        </FormHelperText>
                    )}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                        {avoidTopics.map((t, i) => (
                            <Chip
                                key={`${t}-${i}`}
                                label={t}
                                onDelete={() => removeTopic(i)}
                                size="small"
                            />
                        ))}
                        {avoidTopics.length === 0 && (
                            <Typography variant="caption" color="text.secondary">
                                No avoided topics yet.
                            </Typography>
                        )}
                    </Box>
                </Box>

                <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                        variant="text"
                        onClick={handleReset}
                        disabled={saving}
                        sx={{ color: palette.textMuted }}
                    >
                        Reset to defaults
                    </Button>
                </Stack>
            </Stack>
        </Container>
    );
};

export default SettingsPage;
