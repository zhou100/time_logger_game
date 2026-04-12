import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { palette } from '../theme';

interface DayWeekTabsProps {
    active: 'day' | 'week';
}

const DayWeekTabs: React.FC<DayWeekTabsProps> = ({ active }) => {
    const navigate = useNavigate();

    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Box
                sx={{
                    display: 'inline-flex',
                    borderRadius: '8px',
                    border: `1px solid ${palette.rule}`,
                    bgcolor: palette.surface,
                    overflow: 'hidden',
                }}
            >
                <Box
                    onClick={() => navigate('/')}
                    sx={{
                        px: 3,
                        py: 1,
                        cursor: 'pointer',
                        bgcolor: active === 'day' ? palette.accent : 'transparent',
                        color: active === 'day' ? '#fff' : palette.textMuted,
                        transition: 'background-color 0.15s, color 0.15s',
                        '&:hover': active !== 'day' ? { bgcolor: palette.surface2 } : undefined,
                    }}
                >
                    <Typography variant="body2" sx={{ fontWeight: 600, userSelect: 'none' }}>
                        Day
                    </Typography>
                </Box>
                <Box
                    onClick={() => navigate('/week')}
                    sx={{
                        px: 3,
                        py: 1,
                        cursor: 'pointer',
                        bgcolor: active === 'week' ? palette.accent : 'transparent',
                        color: active === 'week' ? '#fff' : palette.textMuted,
                        transition: 'background-color 0.15s, color 0.15s',
                        '&:hover': active !== 'week' ? { bgcolor: palette.surface2 } : undefined,
                    }}
                >
                    <Typography variant="body2" sx={{ fontWeight: 600, userSelect: 'none' }}>
                        Week
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};

export default DayWeekTabs;
