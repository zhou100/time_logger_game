import React, { useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  CircularProgress, 
  Alert,
  Fade,
  Grow,
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { addItem, setError, clearError } from '../store/contentSlice';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CategorizedContent from './CategorizedContent';
import Logger from '../utils/logger';
import { RootState } from '../store/store';

interface TranscriptionDisplayProps {
  transcription: string | null;
  isLoading: boolean;
  error?: string;
}

// Generate a random numeric ID
const generateNumericId = () => {
  return Math.floor(Math.random() * 1000000000);
};

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  transcription,
  isLoading,
  error,
}) => {
  const dispatch = useDispatch();
  const storeError = useSelector((state: RootState) => state.content.error);

  useEffect(() => {
    if (error) {
      Logger.error('Transcription error:', error);
      dispatch(setError(error));
    } else {
      dispatch(clearError());
    }
  }, [error, dispatch]);

  return (
    <Fade in={true} timeout={800}>
      <Box
        sx={{
          width: '100%',
          mt: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {isLoading && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2,
              py: 3,
            }}
          >
            <CircularProgress size={40} />
            <Typography variant="body2" color="textSecondary">
              Processing your recording...
            </Typography>
          </Box>
        )}

        {(error || storeError) && (
          <Grow in={true}>
            <Alert severity="error" sx={{ width: '100%' }}>
              {error || storeError}
            </Alert>
          </Grow>
        )}

        {transcription && !isLoading && !error && (
          <Grow in={true}>
            <Paper
              elevation={2}
              sx={{
                p: 3,
                borderRadius: 2,
                background: 'linear-gradient(145deg, #ffffff 0%, #f5f5f5 100%)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: 'success.main',
                }}
              >
                <CheckCircleOutlineIcon />
                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                  Transcribed Successfully
                </Typography>
              </Box>

              <Typography
                variant="body1"
                sx={{
                  mt: 3,
                  lineHeight: 1.8,
                  color: 'text.primary',
                  fontFamily: "'Roboto', sans-serif",
                  position: 'relative',
                }}
              >
                {transcription}
              </Typography>
            </Paper>
          </Grow>
        )}

        <CategorizedContent />
      </Box>
    </Fade>
  );
};

export default TranscriptionDisplay;
