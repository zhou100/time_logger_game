import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Snackbar,
    TextField,
    Typography,
    Button,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import { useQuery } from '@tanstack/react-query';
import { EntryItem } from '../types/api';
import { useDeleteEntry, useMoveEntry, useReclassifyEntry, useUpdateEntry } from '../hooks/useEntries';
import { CATEGORY_COLORS, palette } from '../theme';
import DatePickerPopover from './DatePickerPopover';
import { entriesApi } from '../services/api';

const ONBOARDING_KEY = 'debrief_tap_to_edit_seen';

interface EntryCardProps {
    entry: EntryItem;
    readOnly?: boolean;
    highlightTerm?: string;
    snippetText?: string;
    footerExtra?: React.ReactNode;
    /** Show onboarding hint on this card */
    showHint?: boolean;
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

const EntryCard: React.FC<EntryCardProps> = ({ entry, readOnly = false, highlightTerm, snippetText, footerExtra, showHint }) => {
    const [editing, setEditing] = useState(false);
    const [editTexts, setEditTexts] = useState<string[]>([]);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmReclassify, setConfirmReclassify] = useState(false);
    const [reclassifyError, setReclassifyError] = useState(false);

    // Long-press menu
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const didLongPress = useRef(false);

    // Move date picker
    const moveRef = useRef<HTMLLIElement>(null);
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

    // ── Enter edit mode ─────────────────────────────────────────────────────
    const enterEdit = useCallback(() => {
        if (readOnly || editing) return;
        if (hasCats) {
            setEditTexts(categories.map((c) => c.text ?? entry.transcript ?? ''));
        } else {
            setEditTexts([entry.transcript ?? '']);
        }
        setEditing(true);
        // Mark onboarding as seen
        try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* noop */ }
    }, [readOnly, editing, hasCats, categories, entry.transcript]);

    // ── Save & exit edit ────────────────────────────────────────────────────
    const saveAndExit = useCallback(() => {
        if (!editing) return;
        if (hasCats) {
            const changed = categories.some((c, i) => (c.text ?? entry.transcript ?? '') !== editTexts[i]);
            if (changed) {
                const updatedCategories = categories.map((c, i) => ({
                    id: c.id,
                    text: editTexts[i],
                    category: c.category,
                    estimated_minutes: c.estimated_minutes,
                }));
                updateEntry.mutate({ entryId: entry.id, data: { categories: updatedCategories } });
            }
        }
        setEditing(false);
    }, [editing, hasCats, categories, editTexts, entry, updateEntry]);

    // ── Long-press handlers ─────────────────────────────────────────────────
    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (readOnly || editing) return;
        didLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            didLongPress.current = true;
            setMenuAnchor(e.currentTarget);
        }, 500);
    }, [readOnly, editing]);

    const handlePointerUp = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handlePointerLeave = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleClick = useCallback(() => {
        if (didLongPress.current) return;
        if (menuAnchor) return;
        enterEdit();
    }, [enterEdit, menuAnchor]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
        };
    }, []);

    const handleDelete = () => {
        deleteEntry.mutate(entry.id);
        setConfirmDelete(false);
    };

    const isEditing = editing;

    return (
        <>
            {/* Onboarding hint */}
            {showHint && (
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', textAlign: 'center', mb: 0.5, fontStyle: 'italic', opacity: 0.7 }}
                >
                    Tap an entry to edit
                </Typography>
            )}

            <Box
                onPointerDown={!readOnly ? handlePointerDown : undefined}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onClick={!readOnly && !isEditing ? handleClick : undefined}
                sx={{
                    py: 1.5,
                    px: 1,
                    borderRadius: '6px',
                    cursor: readOnly ? 'default' : isEditing ? 'text' : 'pointer',
                    userSelect: isEditing ? 'text' : 'none',
                    transition: 'background-color 0.12s',
                    // Press feedback
                    ...(!readOnly && !isEditing ? {
                        '&:active': { bgcolor: `${palette.accent}0A` },
                        '@media (hover: hover)': {
                            '&:hover': { bgcolor: `${palette.rule}30` },
                        },
                    } : {}),
                    // Edit mode highlight
                    ...(isEditing ? {
                        bgcolor: `${palette.accent}08`,
                        boxShadow: `inset 0 0 0 1px ${palette.rule}`,
                    } : {}),
                    // Prevent text selection while long-pressing
                    WebkitTouchCallout: isEditing ? 'default' : 'none',
                }}
            >
                {snippetText ? (
                    <Typography variant="body2" sx={{ lineHeight: 1.4, color: 'text.primary' }}>
                        {renderHighlightedText(snippetText, highlightTerm)}
                    </Typography>
                ) : isEditing ? (
                    /* ── Inline edit mode ─────────────────────────────────── */
                    hasCats ? categories.map((catItem, i) => {
                        const dotColor = CATEGORY_COLORS[catItem.category] ?? palette.textMuted;
                        return (
                            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: i < categories.length - 1 ? 0.75 : 0 }}>
                                <Box
                                    sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0, mt: '12px' }}
                                    title={catItem.category}
                                />
                                <TextField
                                    variant="standard"
                                    fullWidth
                                    multiline
                                    autoFocus={i === 0}
                                    value={editTexts[i] ?? ''}
                                    onChange={(e) => {
                                        const next = [...editTexts];
                                        next[i] = e.target.value;
                                        setEditTexts(next);
                                    }}
                                    onBlur={(e) => {
                                        // Only save if focus leaves the entire entry card
                                        const related = e.relatedTarget as HTMLElement | null;
                                        if (related && e.currentTarget.closest('[data-entry-card]')?.contains(related)) return;
                                        // Delay to allow other fields to receive focus
                                        setTimeout(() => saveAndExit(), 100);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            saveAndExit();
                                        }
                                        if (e.key === 'Escape') {
                                            setEditing(false);
                                        }
                                    }}
                                    InputProps={{
                                        disableUnderline: true,
                                        sx: { fontSize: '14px', lineHeight: 1.4, py: 0 },
                                    }}
                                    sx={{ '& .MuiInputBase-root': { p: 0 } }}
                                />
                            </Box>
                        );
                    }) : (
                        <TextField
                            variant="standard"
                            fullWidth
                            multiline
                            autoFocus
                            value={editTexts[0] ?? ''}
                            onChange={(e) => setEditTexts([e.target.value])}
                            onBlur={() => setTimeout(() => saveAndExit(), 100)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveAndExit(); }
                                if (e.key === 'Escape') setEditing(false);
                            }}
                            InputProps={{
                                disableUnderline: true,
                                sx: { fontSize: '14px', lineHeight: 1.4, py: 0 },
                            }}
                            sx={{ '& .MuiInputBase-root': { p: 0 } }}
                        />
                    )
                ) : (
                    /* ── Display mode ─────────────────────────────────────── */
                    hasCats ? categories.map((catItem, i) => {
                        const dotColor = CATEGORY_COLORS[catItem.category] ?? palette.textMuted;
                        return (
                            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: i < categories.length - 1 ? 0.75 : 0 }}>
                                <Box
                                    sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0, mt: '6px' }}
                                    title={catItem.category}
                                />
                                <Typography variant="body2" sx={{ lineHeight: 1.4, flex: 1 }}>
                                    {renderHighlightedText(catItem.text ?? entry.transcript, highlightTerm)}
                                </Typography>
                            </Box>
                        );
                    }) : (
                        <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                            {renderHighlightedText(entry.transcript, highlightTerm)}
                        </Typography>
                    )
                )}

                {/* Footer: time */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                    {footerExtra}
                </Box>
            </Box>

            {/* ── Long-press context menu ─────────────────────────────── */}
            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                transformOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <MenuItem
                    onClick={() => { setMenuAnchor(null); setConfirmReclassify(true); }}
                    disabled={reclassifyEntry.isPending}
                >
                    <ListItemIcon><AutorenewIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Re-classify</ListItemText>
                </MenuItem>
                <MenuItem
                    ref={moveRef}
                    onClick={() => { setMenuAnchor(null); setMoveAnchor(moveRef.current); }}
                    disabled={moveEntry.isPending}
                >
                    <ListItemIcon><DriveFileMoveIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Move to date</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { setMenuAnchor(null); setConfirmDelete(true); }}>
                    <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: palette.error }} /></ListItemIcon>
                    <ListItemText sx={{ color: palette.error }}>Delete</ListItemText>
                </MenuItem>
            </Menu>

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

            <Dialog open={confirmReclassify} onClose={() => setConfirmReclassify(false)} maxWidth="xs">
                <DialogTitle>Re-classify with AI?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will replace all categories on this entry with fresh AI output.
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
