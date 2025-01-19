import React, { useState, useEffect, useCallback } from 'react';
import { 
  Container, 
  Box, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  Chip,
  LinearProgress,
  Fade,
  Grid,
  Card,
  CardContent,
  Badge,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RecordButton from '../components/RecordButton';
import TranscriptionDisplay from '../components/TranscriptionDisplay';
import { audioApi } from '../services/api';
import type { TranscriptionResponse } from '../types/api';

const RecordingPage: React.FC = () => {
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [categories, setCategories] = useState<Array<{category: string; extracted_content: string}>>([]);
  const [stats, setStats] = useState({
    totalRecordings: 0,
    totalMinutes: 0,
    streak: 0,
  });

  // Simulated progress towards next level (0-100)
  const [levelProgress, setLevelProgress] = useState(0);

  const handleRecordingComplete = useCallback(async (blob: Blob) => {
    setIsTranscribing(true);
    setError(undefined);
    setCategories([]);

    try {
      const response = await audioApi.uploadAudio(blob);
      setTranscription(response.transcribed_text);
      setCategories(response.categories);
      
      // Update stats
      setStats(prev => ({
        totalRecordings: prev.totalRecordings + 1,
        totalMinutes: prev.totalMinutes + Math.floor(Math.random() * 5) + 1,
        streak: prev.streak + 1,
      }));
      
      // Update level progress
      setLevelProgress(prev => Math.min(100, prev + Math.floor(Math.random() * 30)));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to transcribe audio';
      setError(errorMessage);
      console.error('Transcription error:', err);
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  useEffect(() => {
    if (transcription) {
      setIsTranscribing(false);
    }
  }, [transcription]);

  const handleAudioUpload = async (audioBlob: Blob) => {
    handleRecordingComplete(audioBlob);
  };

  return (
    <Container maxWidth="md">
      <Box
        sx={{
          mt: 4,
          mb: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography 
          variant="h3" 
          component="h1" 
          gutterBottom
          sx={{
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
            backgroundClip: 'text',
            textFillColor: 'transparent',
            mb: 4,
          }}
        >
          Time Logger
        </Typography>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Badge 
                  badgeContent={<EmojiEventsIcon sx={{ fontSize: 16 }} />}
                  color="primary"
                  sx={{ '& .MuiBadge-badge': { width: 22, height: 22, borderRadius: '50%' } }}
                >
                  <Typography variant="h4" color="primary">
                    {stats.totalRecordings}
                  </Typography>
                </Badge>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  Total Recordings
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Badge 
                  badgeContent={<AccessTimeIcon sx={{ fontSize: 16 }} />}
                  color="secondary"
                  sx={{ '& .MuiBadge-badge': { width: 22, height: 22, borderRadius: '50%' } }}
                >
                  <Typography variant="h4" color="secondary">
                    {stats.totalMinutes}
                  </Typography>
                </Badge>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  Minutes Logged
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Badge 
                  badgeContent={<TrendingUpIcon sx={{ fontSize: 16 }} />}
                  color="success"
                  sx={{ '& .MuiBadge-badge': { width: 22, height: 22, borderRadius: '50%' } }}
                >
                  <Typography variant="h4" color="success.main">
                    {stats.streak}
                  </Typography>
                </Badge>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  Day Streak
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ width: '100%', mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color="textSecondary">
              Level Progress
            </Typography>
            <Typography variant="body2" color="primary">
              {levelProgress}%
            </Typography>
          </Box>
          <LinearProgress 
            variant="determinate" 
            value={levelProgress} 
            sx={{ 
              height: 8, 
              borderRadius: 4,
              backgroundColor: 'rgba(0,0,0,0.1)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                backgroundImage: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
              }
            }} 
          />
        </Box>

        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            borderRadius: 2,
            background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
          }}
        >
          <RecordButton onRecordingComplete={handleAudioUpload} />
          <TranscriptionDisplay
            transcription={transcription}
            isLoading={isTranscribing}
            error={error}
          />
          
          {categories && categories.length > 0 && (
            <Fade in={true} timeout={1000}>
              <Box sx={{ width: '100%', mt: 4 }}>
                <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>
                  Time Categories
                </Typography>
                <List>
                  {categories.map((cat, index) => (
                    <ListItem 
                      key={index}
                      sx={{
                        mb: 2,
                        backgroundColor: 'rgba(0,0,0,0.02)',
                        borderRadius: 2,
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          backgroundColor: 'rgba(0,0,0,0.04)',
                          transform: 'translateX(8px)',
                        }
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip 
                              label={cat.category} 
                              color="primary" 
                              size="small"
                              sx={{ 
                                fontWeight: 500,
                                background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                              }}
                            />
                            <Typography sx={{ ml: 1 }}>{cat.extracted_content}</Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </Fade>
          )}
        </Paper>
      </Box>
    </Container>
  );
};

export default RecordingPage;
