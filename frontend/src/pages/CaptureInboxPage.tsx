import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Container, Tabs, Tab, ToggleButtonGroup, ToggleButton,
    List, ListItem, IconButton, TextField, Typography, Chip, Stack, Button, Alert, CircularProgress,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { capturesApi } from '../services/api';
import { Capture, CaptureCategory, CaptureStatus } from '../types/api';
import { CATEGORY_COLORS, CATEGORY_LABELS, palette } from '../theme';

type StatusFilter = CaptureStatus | 'all';

const CATEGORIES: CaptureCategory[] = ['TODO', 'IDEA', 'THOUGHT'];

const CaptureInboxPage: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [category, setCategory] = useState<CaptureCategory>('TODO');
    const [status, setStatus] = useState<StatusFilter>('open');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState('');

    const { data: captures = [], isLoading, error } = useQuery({
        queryKey: ['captures', category, status],
        queryFn: () => capturesApi.list({ category, status }),
    });

    const patchMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: { status?: CaptureStatus; edited_text?: string } }) =>
            capturesApi.patch(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['captures'] });
            qc.invalidateQueries({ queryKey: ['entries'] });
            setEditingId(null);
        },
    });

    const openCounts = useQuery({
        queryKey: ['capture-counts'],
        queryFn: async () => {
            const all = await capturesApi.list({ status: 'open' });
            return CATEGORIES.reduce<Record<CaptureCategory, number>>((acc, cat) => {
                acc[cat] = all.filter(c => c.category === cat).length;
                return acc;
            }, { TODO: 0, IDEA: 0, THOUGHT: 0 });
        },
    });

    const startEdit = (c: Capture) => {
        setEditingId(c.id);
        setEditDraft(c.display_text || '');
    };

    const saveEdit = (id: string) => {
        patchMutation.mutate({ id, data: { edited_text: editDraft } });
    };

    const setStatusOf = (id: string, newStatus: CaptureStatus) => {
        patchMutation.mutate({ id, data: { status: newStatus } });
    };

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Typography variant="h3" sx={{ mb: 1 }}>Capture Inbox</Typography>
            <Typography variant="body2" sx={{ color: palette.textMuted, mb: 3 }}>
                Triage what came up across all your recordings.
            </Typography>

            <Tabs
                value={category}
                onChange={(_, v) => setCategory(v)}
                sx={{ mb: 2, borderBottom: 1, borderColor: palette.rule }}
            >
                {CATEGORIES.map(cat => (
                    <Tab
                        key={cat}
                        value={cat}
                        label={
                            <Stack direction="row" spacing={1} alignItems="center">
                                <span>{CATEGORY_LABELS[cat]}</span>
                                {openCounts.data && openCounts.data[cat] > 0 && (
                                    <Chip
                                        size="small"
                                        label={openCounts.data[cat]}
                                        sx={{ bgcolor: CATEGORY_COLORS[cat], color: 'white', height: 20 }}
                                    />
                                )}
                            </Stack>
                        }
                    />
                ))}
            </Tabs>

            <ToggleButtonGroup
                value={status}
                exclusive
                size="small"
                onChange={(_, v) => v && setStatus(v)}
                sx={{ mb: 2 }}
            >
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="open">Open</ToggleButton>
                <ToggleButton value="done">Done</ToggleButton>
                <ToggleButton value="dismissed">Dismissed</ToggleButton>
            </ToggleButtonGroup>

            {isLoading && <CircularProgress size={24} />}
            {error && <Alert severity="error">Failed to load captures.</Alert>}
            {patchMutation.isError && (
                <Alert severity="error" sx={{ mb: 2 }}>Update failed. Try again.</Alert>
            )}

            {!isLoading && captures.length === 0 && (
                <Typography sx={{ color: palette.textMuted, mt: 4, textAlign: 'center' }}>
                    Nothing here.
                </Typography>
            )}

            <List>
                {captures.map(c => (
                    <ListItem
                        key={c.id}
                        sx={{
                            borderBottom: 1,
                            borderColor: palette.rule,
                            alignItems: 'flex-start',
                            py: 2,
                            opacity: c.status === 'open' ? 1 : 0.55,
                        }}
                    >
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            {editingId === c.id ? (
                                <Stack direction="row" spacing={1}>
                                    <TextField
                                        value={editDraft}
                                        onChange={e => setEditDraft(e.target.value)}
                                        size="small"
                                        fullWidth
                                        multiline
                                        autoFocus
                                    />
                                    <Button onClick={() => saveEdit(c.id)} variant="contained" size="small">Save</Button>
                                    <Button onClick={() => setEditingId(null)} size="small">Cancel</Button>
                                </Stack>
                            ) : (
                                <Typography
                                    variant="body1"
                                    sx={{
                                        textDecoration: c.status === 'done' ? 'line-through' : 'none',
                                    }}
                                >
                                    {c.display_text || <em>(no text)</em>}
                                </Typography>
                            )}
                            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} alignItems="center">
                                {c.edited && <Chip size="small" label="edited" sx={{ height: 18, fontSize: 10 }} />}
                                {c.status !== 'open' && (
                                    <Chip
                                        size="small"
                                        label={c.status}
                                        sx={{ height: 18, fontSize: 10, textTransform: 'uppercase' }}
                                    />
                                )}
                                {c.source_date && (
                                    <Typography
                                        variant="caption"
                                        sx={{ color: palette.textMuted, cursor: 'pointer', textDecoration: 'underline' }}
                                        onClick={() => navigate(`/?date=${c.source_date}`)}
                                    >
                                        from {c.source_date}
                                    </Typography>
                                )}
                            </Stack>
                        </Box>
                        {editingId !== c.id && (
                            <Stack direction="row" spacing={0.5}>
                                <IconButton size="small" onClick={() => startEdit(c)} aria-label="edit">
                                    <EditIcon fontSize="small" />
                                </IconButton>
                                {c.status !== 'done' && (
                                    <IconButton
                                        size="small"
                                        onClick={() => setStatusOf(c.id, 'done')}
                                        aria-label="mark done"
                                        sx={{ color: palette.success }}
                                    >
                                        <CheckIcon fontSize="small" />
                                    </IconButton>
                                )}
                                {c.status !== 'dismissed' && (
                                    <IconButton
                                        size="small"
                                        onClick={() => setStatusOf(c.id, 'dismissed')}
                                        aria-label="dismiss"
                                        sx={{ color: palette.textMuted }}
                                    >
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                )}
                            </Stack>
                        )}
                    </ListItem>
                ))}
            </List>
        </Container>
    );
};

export default CaptureInboxPage;
