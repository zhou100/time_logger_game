import React, { useRef, useState } from 'react';
import {
    Box,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    MenuItem,
    Select,
    TextField,
    Typography,
    Button,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';
import { EntryItem } from '../types/api';
import { useDeleteEntry, useMoveEntry, useReclassifyEntry, useUpdateEntry } from '../hooks/useEntries';
import { CATEGORY_COLORS, palette } from '../theme';
import DatePickerPopover from './DatePickerPopover';
import { entriesApi } from '../services/api';

const CATEGORIES = ['EARNING', 'LEARNING', 'RELAXING', 'FAMILY', 'TODO', 'IDEA', 'THOUGHT', 'TIME_RECORD'];

interface EntryCardProps {
    entry: EntryItem;
    readOnly?: boolean;
}

const EntryCard: React.FC<EntryCardProps> = ({ entry, readOnly = false }) => {
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editText, setEditText] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const moveRef = useRef<HTMLButtonElement>(null);
    const [moveAnchor, setMoveAnchor] = useState<HTMLElement | null>(null);

    const deleteEntry = useDeleteEntry();
    const updateEntry = useUpdateEntry();
    const reclassifyEntry = useReclassifyEntry();
    const moveEntry = useMoveEntry();

    const { data: activeDatesRaw = [] } = useQuery({
        queryKey: ['active-dates'],
        queryFn: () => entriesApi.getActiveDates(),
        staleTime: 5 * 60_000,
    });
    const activeDates = new Set(activeDatesRaw);

    const today = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    const categories = entry.categories;
    const hasCats = categories.length > 0;

    const handleEditStart = (index: number) => {
        const cat = categories[index];
        setEditText(cat?.text ?? entry.transcript ?? '');
        setEditCategory(cat?.category ?? 'THOUGHT');
        setEditingIndex(index);
    };

    const handleEditSave = () => {
        if (editingIndex === null) return;
        // Preserve all classifications — only update the one being edited
        const updatedCategories = categories.map((c, i) =>
            i === editingIndex
                ? { text: editText, category: editCategory, estimated_minutes: c.estimated_minutes }
                : { text: c.text, category: c.category, estimated_minutes: c.estimated_minutes }
        );
        updateEntry.mutate({
            entryId: entry.id,
            data: { categories: updatedCategories },
        });
        setEditingIndex(null);
    };

    const handleDelete = () => {
        deleteEntry.mutate(entry.id);
        setConfirmDelete(false);
    };

    const borderStyle = `1px solid ${palette.rule}`;

    return (
        <>
            <Box sx={{ mb: 1.5, pb: 1.5, borderBottom: borderStyle, '&:last-child': { borderBottom: 'none', mb: 0, pb: 0 } }}>
                {hasCats ? categories.map((catItem, i) => {
                    const isEditingThis = editingIndex === i;

                    if (isEditingThis) {
                        return (
                            <Box key={i} sx={{ mb: i < categories.length - 1 ? 1 : 0 }}>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                                    <Select
                                        size="small"
                                        value={editCategory}
                                        onChange={(e) => setEditCategory(e.target.value)}
                                        sx={{ minWidth: 130, fontSize: '0.75rem' }}
                                    >
                                        {CATEGORIES.map((c) => (
                                            <MenuItem key={c} value={c} sx={{ fontSize: '0.75rem' }}>{c}</MenuItem>
                                        ))}
                                    </Select>
                                    <IconButton size="small" onClick={handleEditSave} color="primary" disabled={updateEntry.isPending}>
                                        <CheckIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => setEditingIndex(null)}>
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                                <TextField
                                    size="small"
                                    fullWidth
                                    multiline
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    sx={{ fontSize: '0.8rem' }}
                                />
                            </Box>
                        );
                    }

                    return (
                        <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: i < categories.length - 1 ? 0.75 : 0 }}>
                            <Chip
                                label={catItem.category}
                                size="small"
                                sx={{
                                    fontSize: '0.65rem',
                                    height: 18,
                                    flexShrink: 0,
                                    borderColor: CATEGORY_COLORS[catItem.category] ?? palette.textMuted,
                                    color: CATEGORY_COLORS[catItem.category] ?? palette.textMuted,
                                    bgcolor: `${CATEGORY_COLORS[catItem.category] ?? palette.textMuted}0F`,
                                }}
                                variant="outlined"
                            />
                            <Typography variant="body2" sx={{ lineHeight: 1.5, flex: 1 }}>
                                {catItem.text ?? entry.transcript ?? 'Processing…'}
                            </Typography>
                            {!readOnly && (
                                <IconButton size="small" onClick={() => handleEditStart(i)} sx={{ p: 0.25, flexShrink: 0 }}>
                                    <EditIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                </IconButton>
                            )}
                        </Box>
                    );
                }) : (
                    <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                        {entry.transcript ?? 'Processing…'}
                    </Typography>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                    {!readOnly && (
                        <Box sx={{ display: 'flex', gap: 0.25 }}>
                            <IconButton
                                size="small"
                                onClick={() => reclassifyEntry.mutate(entry.id)}
                                sx={{ p: 0.25 }}
                                disabled={reclassifyEntry.isPending}
                                title="Re-classify with AI"
                            >
                                <AutorenewIcon sx={{
                                    fontSize: 14,
                                    color: 'text.secondary',
                                    ...(reclassifyEntry.isPending && { animation: 'spin 1s linear infinite', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }),
                                }} />
                            </IconButton>
                            <IconButton
                                ref={moveRef}
                                size="small"
                                onClick={() => setMoveAnchor(moveRef.current)}
                                sx={{ p: 0.25 }}
                                disabled={moveEntry.isPending}
                            >
                                <DriveFileMoveIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            </IconButton>
                            <IconButton size="small" onClick={() => setConfirmDelete(true)} sx={{ p: 0.25 }}>
                                <DeleteIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            </IconButton>
                        </Box>
                    )}
                </Box>
            </Box>

            <DatePickerPopover
                anchorEl={moveAnchor}
                onClose={() => setMoveAnchor(null)}
                selectedDate={entry.created_at.split('T')[0]}
                activeDates={activeDates}
                maxDate={today}
                onSelect={(date) => moveEntry.mutate({ entryId: entry.id, date })}
            />

            <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs">
                <DialogTitle>Delete entry?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will permanently remove this entry and its audio recording.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <Button onClick={handleDelete} color="error" variant="contained" disabled={deleteEntry.isPending}>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default EntryCard;
