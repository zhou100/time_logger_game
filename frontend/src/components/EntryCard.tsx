import React, { useRef, useState } from 'react';
import {
    Alert,
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
    Snackbar,
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

const CATEGORIES = ['EARNING', 'LEARNING', 'RELAXING', 'FAMILY', 'TODO', 'EXPERIMENT', 'REFLECTION', 'TIME_RECORD'];

interface EntryCardProps {
    entry: EntryItem;
    readOnly?: boolean;
    highlightTerm?: string;
    footerExtra?: React.ReactNode;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(value: string | null | undefined, highlightTerm?: string): React.ReactNode {
    const text = value ?? 'Processing…';
    const query = highlightTerm?.trim();
    if (!query) return text;

    const regex = new RegExp(`(${escapeRegExp(query)})`, 'ig');
    const parts = text.split(regex);
    const lowerQuery = query.toLowerCase();

    return parts.map((part, index) => (
        part.toLowerCase() === lowerQuery
            ? (
                <Box
                    key={`${part}-${index}`}
                    component="mark"
                    sx={{ bgcolor: '#F5E6A7', color: 'inherit', px: 0.25, borderRadius: '2px' }}
                >
                    {part}
                </Box>
            )
            : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ));
}

const EntryCard: React.FC<EntryCardProps> = ({ entry, readOnly = false, highlightTerm, footerExtra }) => {
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmLastLineDelete, setConfirmLastLineDelete] = useState(false);
    const [confirmReclassify, setConfirmReclassify] = useState(false);
    const [editText, setEditText] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const moveRef = useRef<HTMLButtonElement>(null);
    const [moveAnchor, setMoveAnchor] = useState<HTMLElement | null>(null);
    const [reclassifyError, setReclassifyError] = useState(false);

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
        setEditCategory(cat?.category ?? 'REFLECTION');
        setEditingIndex(index);
    };

    const handleEditSave = () => {
        if (editingIndex === null) return;
        // Preserve all classifications — only update the one being edited
        const updatedCategories = categories.map((c, i) =>
            i === editingIndex
                ? { id: c.id, text: editText, category: editCategory, estimated_minutes: c.estimated_minutes }
                : { id: c.id, text: c.text, category: c.category, estimated_minutes: c.estimated_minutes }
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

    const handleDeleteLine = (index: number) => {
        if (categories.length <= 1) {
            // Last line — would delete the whole audio recording. Confirm first.
            setConfirmLastLineDelete(true);
            return;
        }
        const remaining = categories
            .filter((_, i) => i !== index)
            .map((c) => ({ id: c.id, text: c.text, category: c.category, estimated_minutes: c.estimated_minutes }));
        updateEntry.mutate({ entryId: entry.id, data: { categories: remaining } });
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
                                {renderHighlightedText(catItem.text ?? entry.transcript, highlightTerm)}
                            </Typography>
                            {!readOnly && (
                                <>
                                    <IconButton size="small" onClick={() => handleEditStart(i)} sx={{ p: 0.25, flexShrink: 0 }}>
                                        <EditIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => handleDeleteLine(i)} sx={{ p: 0.25, flexShrink: 0 }} title="Delete this line">
                                        <DeleteIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                    </IconButton>
                                </>
                            )}
                        </Box>
                    );
                }) : (
                    <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                        {renderHighlightedText(entry.transcript, highlightTerm)}
                    </Typography>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        {footerExtra}
                    </Box>
                    {!readOnly && (
                        <Box sx={{ display: 'flex', gap: 0.25 }}>
                            <IconButton
                                size="small"
                                onClick={() => setConfirmReclassify(true)}
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

            <Dialog open={confirmLastLineDelete} onClose={() => setConfirmLastLineDelete(false)} maxWidth="xs">
                <DialogTitle>Delete last line?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This is the only line left, so deleting it will remove the entire entry and its audio recording.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmLastLineDelete(false)}>Cancel</Button>
                    <Button
                        onClick={() => { setConfirmLastLineDelete(false); deleteEntry.mutate(entry.id); }}
                        color="error"
                        variant="contained"
                        disabled={deleteEntry.isPending}
                    >
                        Delete entry
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmReclassify} onClose={() => setConfirmReclassify(false)} maxWidth="xs">
                <DialogTitle>Re-classify with AI?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will replace all categories on this entry with fresh AI output. Any inbox status (done/dismissed) on these items will be reset.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmReclassify(false)}>Cancel</Button>
                    <Button
                        onClick={() => {
                            setConfirmReclassify(false);
                            reclassifyEntry.mutate(entry.id, { onError: () => setReclassifyError(true) });
                        }}
                        color="primary"
                        variant="contained"
                        disabled={reclassifyEntry.isPending}
                    >
                        Re-classify
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={reclassifyError} autoHideDuration={4000} onClose={() => setReclassifyError(false)}>
                <Alert severity="error" onClose={() => setReclassifyError(false)} variant="filled" sx={{ width: '100%' }}>
                    Re-classify failed — please try again
                </Alert>
            </Snackbar>
        </>
    );
};

export default EntryCard;
