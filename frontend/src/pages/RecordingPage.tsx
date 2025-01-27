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
import { Category } from '../types/api';
import { useDispatch } from 'react-redux';
import { addItem } from '../store/contentSlice';
import Logger from '../utils/logger';

const categoryMap: Record<string, Category> = {
  'TODO': Category.TODO,
  'IDEA': Category.IDEA,
  'THOUGHT': Category.THOUGHT,
  'TIME_RECORD': Category.TIME_RECORD,
  'TO-DO': Category.TODO,
  'TIME RECORD': Category.TIME_RECORD,
  'todo': Category.TODO,
  'idea': Category.IDEA,
  'thought': Category.THOUGHT,
  'time_record': Category.TIME_RECORD,
};

const getCategory = (category: string): Category => {
  const normalizedCategory = category.toUpperCase().trim();
  const mappedCategory = categoryMap[normalizedCategory];
  
  if (!mappedCategory) {
    Logger.warn(`Unsupported category "${category}" defaulted to THOUGHT`);
    return Category.THOUGHT;
  }
  
  return mappedCategory;
};

const RecordingPage: React.FC = () => {
  const dispatch = useDispatch();
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | undefined>();
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

    try {
      Logger.debug('Processing recording...');
      const response = await audioApi.uploadAudio(blob);
      Logger.debug('API Response:', {
        hasTranscription: !!response.transcribed_text,
        categoriesCount: response.categories?.length || 0,
        categories: response.categories?.map(c => c.category)
      });

      setTranscription(response.transcribed_text);
      
      // Map API response categories to expected format and dispatch to store
      if (response.categories && Array.isArray(response.categories)) {
        Logger.debug('Processing categories from response:', {
          categories: response.categories,
          validCategories: Object.values(Category)
        });

        response.categories.forEach((cat, index) => {
          if (!cat.category || !cat.extracted_content) {
            Logger.warn('Invalid category data:', cat);
            return;
          }

          const category = getCategory(cat.category);
          Logger.debug(`Adding item with category: ${category}`, {
            originalCategory: cat.category,
            mappedCategory: category,
            content: cat.extracted_content,
            allCategories: Object.values(Category)
          });
          
          dispatch(addItem({
            id: Date.now() + index,
            text: cat.extracted_content,
            category,
            timestamp: new Date().toISOString()
          }));
        });
      }

      // Update stats
      setStats(prev => ({
        totalRecordings: prev.totalRecordings + 1,
        totalMinutes: prev.totalMinutes + Math.floor(Math.random() * 5) + 1,
        streak: prev.streak + 1,
      }));
      
      // Update level progress
      setLevelProgress(prev => Math.min(100, prev + Math.floor(Math.random() * 30)));
    } catch (err) {
      Logger.error('Error processing recording:', err);
      setError(err instanceof Error ? err.message : 'Error processing recording');
    } finally {
      setIsTranscribing(false);
    }
  }, [dispatch]);

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
        </Paper>
      </Box>
    </Container>
  );
};

export default RecordingPage;
