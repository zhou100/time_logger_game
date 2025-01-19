import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { Box, CircularProgress, Typography, LinearProgress, Alert, IconButton } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import { useReactMediaRecorder } from 'react-media-recorder';

interface RecordButtonProps {
  onRecordingComplete: (blob: Blob) => Promise<void>;
}

const RecordButton: React.FC<RecordButtonProps> = memo(({ onRecordingComplete }) => {
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clickAttempts, setClickAttempts] = useState(0);
  const [isStoppingRecording, setIsStoppingRecording] = useState(false);

  const onRecordingStop = useCallback(async (blobUrl: string, blob: Blob) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Recording stopped:`, {
      blobUrl,
      blobSize: blob?.size,
      clickAttempts
    });

    setRecordingTime(0);
    setClickAttempts(0);
    setIsStoppingRecording(false);
    
    if (blob) {
      try {
        await onRecordingComplete(blob);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to process recording';
        setError(errorMessage);
        console.error(`[${timestamp}] Recording error:`, err);
      }
    }
  }, [onRecordingComplete, clickAttempts]);

  const mediaRecorder = useReactMediaRecorder({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false,
    blobPropertyBag: {
      type: 'audio/webm'
    },
    onStop: onRecordingStop,
    mediaRecorderOptions: {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000
    }
  });

  const {
    status,
    startRecording,
    stopRecording,
    mediaBlobUrl,
    clearBlobUrl
  } = mediaRecorder;

  // Handle recording timer
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    
    if (status === 'recording' && !isStoppingRecording) {
      timerId = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerId) {
        clearInterval(timerId);
      }
    };
  }, [status, isStoppingRecording]);

  const handleStopRecording = useCallback(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Executing stop recording`);
    
    setIsStoppingRecording(true);
    if (typeof stopRecording === 'function') {
      try {
        stopRecording();
        console.log(`[${timestamp}] Stop recording function called`);
      } catch (err) {
        console.error(`[${timestamp}] Error stopping recording:`, err);
        setError('Failed to stop recording');
        setIsStoppingRecording(false);
      }
    } else {
      console.error(`[${timestamp}] Stop recording function not available`);
      setError('Stop recording function not available');
      setIsStoppingRecording(false);
    }
  }, [stopRecording]);

  const handleStartRecording = useCallback(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Starting recording`);
    
    setError(null);
    setRecordingTime(0);
    setIsStoppingRecording(false);
    
    try {
      startRecording();
    } catch (err) {
      console.error(`[${timestamp}] Error starting recording:`, err);
      setError('Failed to start recording');
    }
  }, [startRecording]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const timestamp = new Date().toISOString();
    
    setClickAttempts(prev => prev + 1);
    console.log(`[${timestamp}] Button clicked:`, {
      currentStatus: status,
      recordingTime,
      isRecording: status === 'recording',
      isStoppingRecording
    });

    if (status === 'recording' && !isStoppingRecording) {
      handleStopRecording();
    } else if (status !== 'recording' && !isStoppingRecording) {
      handleStartRecording();
    } else {
      console.log(`[${timestamp}] Ignoring click while stopping recording`);
    }
  }, [status, recordingTime, isStoppingRecording, handleStopRecording, handleStartRecording]);

  const isRecording = useMemo(() => status === 'recording' && !isStoppingRecording, [status, isStoppingRecording]);
  const isLoading = useMemo(() => status === 'acquiring_media' || isStoppingRecording, [status, isStoppingRecording]);
  const hasError = useMemo(() => 
    Boolean(error) || ['permission_denied', 'media_aborted', 'no_specified_media_found', 'media_in_use', 'recorder_error'].includes(status),
    [error, status]
  );

  const getStatusMessage = useCallback(() => {
    if (hasError) {
      return error || 'An error occurred';
    }
    if (isStoppingRecording) {
      return 'Stopping recording...';
    }
    if (isRecording) {
      return 'Recording in progress...';
    }
    if (isLoading) {
      return 'Preparing...';
    }
    return 'Click to Start Recording';
  }, [hasError, error, isStoppingRecording, isRecording, isLoading]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      position: 'relative',
      width: '200px'
    }}>
      {hasError && (
        <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
          {getStatusMessage()}
        </Alert>
      )}
      
      <IconButton
        onClick={handleClick}
        disabled={isLoading}
        color={isRecording ? 'error' : 'primary'}
        size="large"
        aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
        sx={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          border: '2px solid',
          borderColor: 'currentColor',
          transition: 'all 0.3s ease'
        }}
      >
        {isLoading ? (
          <CircularProgress size={40} />
        ) : isRecording ? (
          <StopIcon sx={{ fontSize: 40 }} />
        ) : (
          <MicIcon sx={{ fontSize: 40 }} />
        )}
      </IconButton>

      <Typography variant="body2" color="text.secondary">
        {getStatusMessage()}
      </Typography>

      {isRecording && (
        <Box sx={{ width: '100%', mt: 1 }}>
          <Typography variant="body2" align="center" color="text.secondary">
            {formatTime(recordingTime)}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(recordingTime % 60) * 1.67}
            sx={{ mt: 1 }}
          />
        </Box>
      )}
    </Box>
  );
});

export default RecordButton;
