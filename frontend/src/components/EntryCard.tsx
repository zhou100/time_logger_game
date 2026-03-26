import React, { useState } from 'react';
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
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { EntryItem, CategoryItem } from '../types/api';
import { useDeleteEntry, useUpdateEntry } from '../hooks/useEntries';

const CATEGORY_COLORS: Record<string, string> = {
    TODO: '#1976d2',
    IDEA: '#9c27b0',
    THOUGHT: '#555555',
    TIME_RECORD: '#f57c00',
};

const CATEGORIES = ['TODO', 'IDEA', 'THOUGHT', 'TIME_RECORD'];

interface EntryCardProps {
    entry: EntryItem;
    readOnly?: boolean;
}

const EntryCard: React.FC<EntryCardProps> = ({ entry, readOnly = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editText, setEditText] = useState('');
    const [editCategory, setEditCategory] = useState('');

    const deleteEntry = useDeleteEntry();
    const updateEntry = useUpdateEntry();

    const cat = entry.categories.length > 0 ? entry.categories[0].category : null;
    const text = entry.categories[0]?.text ?? entry.transcript ?? 'Processing…';

    const handleEditStart = () => {
        setEditText(text);
        setEditCategory(cat ?? 'THOUGHT');
        setIsEditing(true);
    };

    const handleEditSave = () => {
        updateEntry.mutate({
            entryId: entry.id,
            data: {
                transcript: editText,
                categories: [{ text: editText, category: editCategory }],
            },
        });
        setIsEditing(false);
    };

    const handleDelete = () => {
        deleteEntry.mutate(entry.id);
        setConfirmDelete(false);
    };

    if (isEditing) {
        return (
            <Box sx={{ mb: 1.5, pb: 1.5, borderBottom: '1px dashed #eee', '&:last-child': { borderBottom: 'none', mb: 0, pb: 0 } }}>
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
                    <IconButton size="small" onClick={() => setIsEditing(false)}>
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
        <>
            <Box sx={{ mb: 1.5, pb: 1.5, borderBottom: '1px dashed #eee', '&:last-child': { borderBottom: 'none', mb: 0, pb: 0 } }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    {cat && (
                        <Chip
                            label={cat}
                            size="small"
                            sx={{
                                fontSize: '0.65rem',
                                height: 18,
                                flexShrink: 0,
                                borderColor: CATEGORY_COLORS[cat] ?? '#aaa',
                                color: CATEGORY_COLORS[cat] ?? '#aaa',
                            }}
                            variant="outlined"
                        />
                    )}
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.4, flex: 1 }}>
                        {text}
                    </Typography>
                    {!readOnly && (
                        <Box sx={{ display: 'flex', gap: 0, flexShrink: 0, ml: 0.5 }}>
                            <IconButton size="small" onClick={handleEditStart} sx={{ p: 0.25 }}>
                                <EditIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            </IconButton>
                            <IconButton size="small" onClick={() => setConfirmDelete(true)} sx={{ p: 0.25 }}>
                                <DeleteIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            </IconButton>
                        </Box>
                    )}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                    {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Typography>
            </Box>

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
