import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { Box, CircularProgress, Typography, LinearProgress, Alert, IconButton, keyframes } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import { useReactMediaRecorder } from 'react-media-recorder';
import { palette } from '../theme';

const pulse = keyframes`
    0% { box-shadow: 0 0 0 0 rgba(182, 73, 45, 0.4); }
    70% { box-shadow: 0 0 0 14px rgba(182, 73, 45, 0); }
    100% { box-shadow: 0 0 0 0 rgba(182, 73, 45, 0); }
`;

interface RecordButtonProps {
  onRecordingComplete: (blob: Blob) => Promise<void>;
}

const RecordButton: React.FC<RecordButtonProps> = memo(({ onRecordingComplete }) => {
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isStoppingRecording, setIsStoppingRecording] = useState(false);

  const onRecordingStop = useCallback(async (_blobUrl: string, blob: Blob) => {
    setRecordingTime(0);
    setIsStoppingRecording(false);

    if (blob) {
      try {
        await onRecordingComplete(blob);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process recording');
      }
    }
  }, [onRecordingComplete]);

  const { status, startRecording, stopRecording } = useReactMediaRecorder({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
    blobPropertyBag: { type: 'audio/webm' },
    onStop: onRecordingStop,
    mediaRecorderOptions: {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000,
    },
  });

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (status === 'recording' && !isStoppingRecording) {
      timerId = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    }
    return () => { if (timerId) clearInterval(timerId); };
  }, [status, isStoppingRecording]);

  const handleClick = useCallback(() => {
    if (status === 'recording' && !isStoppingRecording) {
      setIsStoppingRecording(true);
      stopRecording();
    } else if (status !== 'recording' && !isStoppingRecording) {
      setError(null);
      setRecordingTime(0);
      startRecording();
    }
  }, [status, isStoppingRecording, stopRecording, startRecording]);

  const isRecording = useMemo(() => status === 'recording' && !isStoppingRecording, [status, isStoppingRecording]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2, width: '100%' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <IconButton
        onClick={handleClick}
        disabled={isStoppingRecording || status === 'acquiring_media'}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        sx={{
          width: 72,
          height: 72,
          bgcolor: isRecording ? palette.accentHover : palette.accent,
          color: '#fff',
          '&:hover': {
            bgcolor: isRecording ? palette.accent : palette.accentHover,
          },
          animation: !isRecording && status !== 'acquiring_media' ? `${pulse} 2s infinite` : 'none',
          transition: 'background-color 100ms ease-out',
        }}
      >
        {isRecording ? <StopIcon sx={{ fontSize: 32 }} /> : <MicIcon sx={{ fontSize: 32 }} />}
      </IconButton>

      {status === 'acquiring_media' && (
        <CircularProgress
          size={24}
          sx={{ position: 'absolute', top: '50%', left: '50%', mt: '-12px', ml: '-12px', color: palette.accent }}
        />
      )}

      {isRecording && (
        <Box sx={{ width: '100%', mt: 2 }}>
          <Typography variant="caption" align="center" display="block" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            Recording: {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(recordingTime % 60) * 1.67}
            sx={{
              mt: 1,
              '& .MuiLinearProgress-bar': {
                backgroundColor: palette.accent,
              },
            }}
          />
        </Box>
      )}
    </Box>
  );
});

export default RecordButton;
