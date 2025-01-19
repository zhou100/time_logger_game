import React from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  CircularProgress, 
  Alert,
  Fade,
  Grow,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

interface TranscriptionDisplayProps {
  transcription: string | null;
  isLoading: boolean;
  error?: string;
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  transcription,
  isLoading,
  error,
}) => {
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

        {error && (
          <Grow in={true}>
            <Alert severity="error" sx={{ width: '100%' }}>
              {error}
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
                  '&::before': {
                    content: '"""',
                    position: 'absolute',
                    left: -20,
                    top: -10,
                    fontSize: '2em',
                    color: 'primary.main',
                    opacity: 0.2,
                  },
                }}
              >
                {transcription}
              </Typography>

              <Box
                sx={{
                  mt: 3,
                  pt: 2,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant="caption" color="textSecondary">
                  Word count: {transcription.split(/\s+/).length}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Characters: {transcription.length}
                </Typography>
              </Box>
            </Paper>
          </Grow>
        )}
      </Box>
    </Fade>
  );
};

export default TranscriptionDisplay;
