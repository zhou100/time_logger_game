import React, { useState } from 'react';
import { Box, IconButton, Popover, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { palette } from '../theme';

interface Props {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    selectedDate: string;       // YYYY-MM-DD
    activeDates: Set<string>;   // set of YYYY-MM-DD
    maxDate: string;            // YYYY-MM-DD, today — disable future
    onSelect: (date: string) => void;
}

function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
    return new Date(year, month, 1).getDay(); // 0=Sun
}

function toIso(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const DatePickerPopover: React.FC<Props> = ({
    anchorEl, onClose, selectedDate, activeDates, maxDate, onSelect,
}) => {
    const [y, m] = selectedDate.split('-').map(Number);
    const [viewYear, setViewYear] = useState(y);
    const [viewMonth, setViewMonth] = useState(m - 1);

    const shiftMonth = (delta: number) => {
        let nm = viewMonth + delta;
        let ny = viewYear;
        if (nm < 0) { nm = 11; ny -= 1; }
        if (nm > 11) { nm = 0; ny += 1; }
        setViewMonth(nm);
        setViewYear(ny);
    };

    const totalDays = daysInMonth(viewYear, viewMonth);
    const startOffset = firstDayOfWeek(viewYear, viewMonth);

    // Build grid cells: nulls for leading blanks, then day numbers
    const cells: (number | null)[] = [
        ...Array(startOffset).fill(null),
        ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    // Pad to full rows
    while (cells.length % 7 !== 0) cells.push(null);

    const [maxY, maxM, maxD] = maxDate.split('-').map(Number);
    const isAfterMax = (year: number, month: number, day: number) =>
        year > maxY || (year === maxY && month + 1 > maxM) ||
        (year === maxY && month + 1 === maxM && day > maxD);

    const canGoNext = !isAfterMax(viewYear, viewMonth + 1 > 11 ? viewYear + 1 : viewYear,
        viewMonth + 1 > 11 ? 0 : viewMonth + 1);

    return (
        <Popover
            open={!!anchorEl}
            anchorEl={anchorEl}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            transformOrigin={{ vertical: 'top', horizontal: 'center' }}
            PaperProps={{ sx: { p: 2, borderRadius: '8px', minWidth: 260 } }}
        >
            {/* Month header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <IconButton size="small" onClick={() => shiftMonth(-1)}>
                    <ChevronLeftIcon fontSize="small" />
                </IconButton>
                <Typography variant="body2" fontWeight={600}>
                    {MONTHS[viewMonth]} {viewYear}
                </Typography>
                <IconButton size="small" onClick={() => shiftMonth(1)} disabled={!canGoNext}>
                    <ChevronRightIcon fontSize="small" />
                </IconButton>
            </Box>

            {/* Day-of-week headers */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
                {DAYS.map((d) => (
                    <Typography key={d} variant="caption" color="text.secondary"
                        sx={{ textAlign: 'center', fontWeight: 600, py: 0.5 }}>
                        {d}
                    </Typography>
                ))}
            </Box>

            {/* Day cells */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {cells.map((day, i) => {
                    if (day === null) return <Box key={i} />;
                    const iso = toIso(viewYear, viewMonth, day);
                    const isSelected = iso === selectedDate;
                    const hasEntry = activeDates.has(iso);
                    const disabled = isAfterMax(viewYear, viewMonth, day);

                    return (
                        <Box
                            key={i}
                            onClick={() => { if (!disabled) { onSelect(iso); onClose(); } }}
                            sx={{
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '6px',
                                py: '4px',
                                cursor: disabled ? 'default' : 'pointer',
                                bgcolor: isSelected ? palette.accent : 'transparent',
                                color: isSelected ? '#fff' : disabled ? 'text.disabled' : 'text.primary',
                                '&:hover': disabled || isSelected ? {} : { bgcolor: `${palette.accent}22` },
                            }}
                        >
                            <Typography variant="caption" sx={{ lineHeight: 1.4, fontWeight: isSelected ? 700 : 400 }}>
                                {day}
                            </Typography>
                            {hasEntry && !isSelected && (
                                <Box sx={{
                                    width: 4, height: 4, borderRadius: '50%',
                                    bgcolor: palette.accent, mt: '1px',
                                }} />
                            )}
                            {hasEntry && isSelected && (
                                <Box sx={{
                                    width: 4, height: 4, borderRadius: '50%',
                                    bgcolor: 'rgba(255,255,255,0.7)', mt: '1px',
                                }} />
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Popover>
    );
};

export default DatePickerPopover;
