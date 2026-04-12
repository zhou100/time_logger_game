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

/* ── Per-line editable row ───────────────────────────────────────────────── */
interface EditableLineProps {
    text: string;
    category: string;
    dotColor: string;
    readOnly: boolean;
    highlightTerm?: string;
    onSave: (newText: string) => void;
    onLongPress: (target: HTMLElement) => void;
}

const EditableLine: React.FC<EditableLineProps> = ({ text, category, dotColor, readOnly, highlightTerm, onSave, onLongPress }) => {
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState(text);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const didLongPress = useRef(false);
    const rowRef = useRef<HTMLDivElement>(null);

    // Sync text prop when entry updates from server
    useEffect(() => { if (!editing) setEditText(text); }, [text, editing]);

    const save = useCallback(() => {
        if (editText !== text) onSave(editText);
        setEditing(false);
    }, [editText, text, onSave]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (readOnly || editing) return;
        didLongPress.current = false;
        const target = e.currentTarget as HTMLElement;
        longPressTimer.current = setTimeout(() => {
            didLongPress.current = true;
            onLongPress(target);
        }, 500);
    }, [readOnly, editing, onLongPress]);

    const clearTimer = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleClick = useCallback(() => {
        if (readOnly || didLongPress.current) return;
        setEditing(true);
        try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* noop */ }
    }, [readOnly]);

    useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }, []);

    if (editing) {
        return (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', minHeight: 44 }}>
                <Box
                    sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0, mt: '12px' }}
                    title={category}
                />
                <TextField
                    variant="standard"
                    fullWidth
                    multiline
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => setTimeout(save, 80)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
                        if (e.key === 'Escape') { setEditText(text); setEditing(false); }
                    }}
                    InputProps={{
                        disableUnderline: true,
                        sx: { fontSize: '14px', lineHeight: 1.4, py: 0.5 },
                    }}
                    sx={{
                        '& .MuiInputBase-root': {
                            p: 0,
                            bgcolor: `${palette.accent}08`,
                            borderRadius: '4px',
                            px: 0.5,
                        },
                    }}
                />
            </Box>
        );
    }

    return (
        <Box
            ref={rowRef}
            onPointerDown={!readOnly ? handlePointerDown : undefined}
            onPointerUp={clearTimer}
            onPointerLeave={clearTimer}
            onPointerCancel={clearTimer}
            onClick={handleClick}
            sx={{
                display: 'flex',
                gap: 1,
                alignItems: 'flex-start',
                minHeight: 44,    // 44px touch target
                py: 0.5,
                px: 0.5,
                mx: -0.5,
                borderRadius: '4px',
                cursor: readOnly ? 'default' : 'pointer',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                WebkitTouchCallout: 'none',
                transition: 'background-color 0.1s',
                '&:active': !readOnly ? { bgcolor: `${palette.accent}0D` } : {},
                '@media (hover: hover)': {
                    '&:hover': !readOnly ? { bgcolor: `${palette.rule}25` } : {},
                },
            }}
        >
            <Box
                sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0, mt: '6px' }}
                title={category}
            />
            <Typography variant="body2" sx={{ lineHeight: 1.4, flex: 1 }}>
                {renderHighlightedText(text, highlightTerm)}
            </Typography>
        </Box>
    );
};

/* ── Main EntryCard ──────────────────────────────────────────────────────── */
const EntryCard: React.FC<EntryCardProps> = ({ entry, readOnly = false, highlightTerm, snippetText, footerExtra, showHint }) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmReclassify, setConfirmReclassify] = useState(false);
    const [reclassifyError, setReclassifyError] = useState(false);

    // Long-press menu (shared across lines)
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

    // Move date picker
    const moveRef = useRef<HTMLLIElement>(null);
    const [moveAnchor, setMoveAnchor] = useState<HTMLElement | null>(null);

    // Single-line edit (no categories)
    const [editingSingle, setEditingSingle] = useState(false);
    const [singleText, setSingleText] = useState(entry.transcript ?? '');
    useEffect(() => { if (!editingSingle) setSingleText(entry.transcript ?? ''); }, [entry.transcript, editingSingle]);

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

    const handleLineSave = useCallback((index: number, newText: string) => {
        const updatedCategories = categories.map((c, i) => ({
            id: c.id,
            text: i === index ? newText : c.text,
            category: c.category,
            estimated_minutes: c.estimated_minutes,
        }));
        updateEntry.mutate({ entryId: entry.id, data: { categories: updatedCategories } });
    }, [categories, entry.id, updateEntry]);

    const handleLongPress = useCallback((target: HTMLElement) => {
        setMenuAnchor(target);
    }, []);

    const handleDelete = () => {
        deleteEntry.mutate(entry.id);
        setConfirmDelete(false);
    };

    // Long-press for single-line entries (no categories)
    const singleLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const singleDidLongPress = useRef(false);

    const handleSinglePointerDown = useCallback((e: React.PointerEvent) => {
        if (readOnly || editingSingle) return;
        singleDidLongPress.current = false;
        const target = e.currentTarget as HTMLElement;
        singleLongPressTimer.current = setTimeout(() => {
            singleDidLongPress.current = true;
            setMenuAnchor(target);
        }, 500);
    }, [readOnly, editingSingle]);

    const clearSingleTimer = useCallback(() => {
        if (singleLongPressTimer.current) {
            clearTimeout(singleLongPressTimer.current);
            singleLongPressTimer.current = null;
        }
    }, []);

    useEffect(() => () => { if (singleLongPressTimer.current) clearTimeout(singleLongPressTimer.current); }, []);

    return (
        <>
            {showHint && (
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', textAlign: 'center', mb: 0.5, fontStyle: 'italic', opacity: 0.7 }}
                >
                    Tap a line to edit
                </Typography>
            )}

            <Box sx={{ py: 1, px: 0.5 }}>
                {snippetText ? (
                    <Typography variant="body2" sx={{ lineHeight: 1.4, color: 'text.primary', minHeight: 44, display: 'flex', alignItems: 'center' }}>
                        {renderHighlightedText(snippetText, highlightTerm)}
                    </Typography>
                ) : hasCats ? (
                    categories.map((catItem, i) => (
                        <EditableLine
                            key={catItem.id ?? i}
                            text={catItem.text ?? entry.transcript ?? ''}
                            category={catItem.category}
                            dotColor={CATEGORY_COLORS[catItem.category] ?? palette.textMuted}
                            readOnly={readOnly}
                            highlightTerm={highlightTerm}
                            onSave={(newText) => handleLineSave(i, newText)}
                            onLongPress={handleLongPress}
                        />
                    ))
                ) : editingSingle ? (
                    <Box sx={{ minHeight: 44 }}>
                        <TextField
                            variant="standard"
                            fullWidth
                            multiline
                            autoFocus
                            value={singleText}
                            onChange={(e) => setSingleText(e.target.value)}
                            onBlur={() => {
                                // No save for single-line (transcript is read-only for now)
                                setEditingSingle(false);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditingSingle(false);
                            }}
                            InputProps={{
                                disableUnderline: true,
                                sx: { fontSize: '14px', lineHeight: 1.4, py: 0.5 },
                            }}
                            sx={{
                                '& .MuiInputBase-root': {
                                    p: 0,
                                    bgcolor: `${palette.accent}08`,
                                    borderRadius: '4px',
                                    px: 0.5,
                                },
                            }}
                        />
                    </Box>
                ) : (
                    <Box
                        onPointerDown={!readOnly ? handleSinglePointerDown : undefined}
                        onPointerUp={clearSingleTimer}
                        onPointerLeave={clearSingleTimer}
                        onPointerCancel={clearSingleTimer}
                        onClick={() => {
                            if (readOnly || singleDidLongPress.current) return;
                            setEditingSingle(true);
                            try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* noop */ }
                        }}
                        sx={{
                            minHeight: 44,
                            display: 'flex',
                            alignItems: 'center',
                            py: 0.5,
                            px: 0.5,
                            mx: -0.5,
                            borderRadius: '4px',
                            cursor: readOnly ? 'default' : 'pointer',
                            userSelect: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            WebkitTouchCallout: 'none',
                            transition: 'background-color 0.1s',
                            '&:active': !readOnly ? { bgcolor: `${palette.accent}0D` } : {},
                            '@media (hover: hover)': {
                                '&:hover': !readOnly ? { bgcolor: `${palette.rule}25` } : {},
                            },
                        }}
                    >
                        <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                            {renderHighlightedText(entry.transcript, highlightTerm)}
                        </Typography>
                    </Box>
                )}

                {/* Footer: time */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap', px: 0.5 }}>
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
