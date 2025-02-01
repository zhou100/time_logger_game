import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Box, 
  Grid, 
  Typography, 
  Paper, 
  CircularProgress, 
  Alert,
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store/store';
import AssignmentIcon from '@mui/icons-material/Assignment';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { moveItem, updateItem } from '../store/contentSlice';
import { Category } from '../types/api';
import { SvgIconComponent } from '@mui/icons-material';
import Logger from '../utils/logger';
import { DragDropContext, DropResult } from 'react-beautiful-dnd';
import DroppableContainer from './DroppableContainer';
import ContentCard from './ContentCard';

// Verify that all Category enum values are strings
const CATEGORY_VALUES = Object.values(Category);
if (!CATEGORY_VALUES.every(value => typeof value === 'string')) {
  Logger.error('Invalid Category enum values:', {
    values: CATEGORY_VALUES,
    types: CATEGORY_VALUES.map(v => typeof v)
  });
  throw new Error('All Category enum values must be strings');
}

interface CategoryConfig {
  type: Category;
  droppableId: string;
  label: string;
  icon: SvgIconComponent;
  color: string;
}

// Ensure droppableId exactly matches the Category enum value
const CATEGORIES: CategoryConfig[] = [
  { 
    type: Category.TODO,
    droppableId: 'TODO',  
    label: 'TODOs',
    icon: AssignmentIcon,
    color: '#e57373'
  },
  { 
    type: Category.IDEA,
    droppableId: 'IDEA',
    label: 'Ideas',
    icon: LightbulbIcon,
    color: '#64b5f6'
  },
  { 
    type: Category.THOUGHT,
    droppableId: 'THOUGHT',
    label: 'Thoughts',
    icon: ChatBubbleOutlineIcon,
    color: '#81c784'
  },
  { 
    type: Category.TIME_RECORD,
    droppableId: 'TIME_RECORD',
    label: 'Time Records',
    icon: AccessTimeIcon,
    color: '#ba68c8'
  }
];

// Verify that all droppableIds match their corresponding Category values
CATEGORIES.forEach(category => {
  if (category.droppableId !== category.type) {
    Logger.error('Mismatched category configuration:', {
      type: category.type,
      droppableId: category.droppableId,
      validCategories: Object.values(Category)
    });
    throw new Error(`Category droppableId must match type: ${category.type}`);
  }
});

const CategorizedContent: React.FC = () => {
  const dispatch = useDispatch();
  const content = useSelector((state: RootState) => state.content);
  const { isLoading, error } = content;
  const itemsArray = useMemo(() => {
    const items = content.items;
    return Array.isArray(items) ? items : [];
  }, [content.items]);
  const [isDragEnabled, setIsDragEnabled] = useState(true); // Enable drag immediately

  useEffect(() => {
    Logger.debug('CategorizedContent mounted', {
      itemCount: itemsArray.length,
      categories: CATEGORIES.map(c => ({
        type: c.type,
        droppableId: c.droppableId,
        itemsInCategory: itemsArray.filter(item => item.category === c.type).length
      }))
    });

    // Verify DOM presence of droppables
    CATEGORIES.forEach(category => {
      const droppableElement = document.querySelector(`[data-rbd-droppable-id="${category.droppableId}"]`);
      Logger.debug(`Droppable verification for ${category.droppableId}:`, {
        isPresent: !!droppableElement,
        elementId: droppableElement?.getAttribute('data-rbd-droppable-id'),
        itemCount: itemsArray.filter(item => item.category === category.type).length
      });
    });

    return () => {
      Logger.debug('CategorizedContent unmounting');
    };
  }, [itemsArray.length]); // Only re-run if the number of items changes

  const handleDragStart = () => {
    // Verify droppables again at drag start
    CATEGORIES.forEach(category => {
      const droppableElement = document.querySelector(`[data-rbd-droppable-id="${category.droppableId}"]`);
      Logger.debug(`Drag start verification for ${category.droppableId}:`, {
        isPresent: !!droppableElement,
        elementId: droppableElement?.getAttribute('data-rbd-droppable-id')
      });
    });
  };

  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result;

    Logger.debug('Drag operation:', {
      sourceId: source.droppableId,
      destinationId: destination?.droppableId,
      draggableId,
      validCategories: Object.values(Category)
    });

    if (!destination) {
      Logger.debug('No valid destination, skipping update');
      return;
    }

    // Verify categories are valid
    const sourceCategory = source.droppableId as Category;
    const destinationCategory = destination.droppableId as Category;

    if (!Object.values(Category).includes(sourceCategory) || 
        !Object.values(Category).includes(destinationCategory)) {
      Logger.error('Invalid category in drag operation:', {
        sourceCategory,
        destinationCategory,
        validCategories: Object.values(Category)
      });
      return;
    }

    // Only dispatch if actually moving between categories
    if (source.droppableId !== destination.droppableId) {
      Logger.debug('Moving item between categories:', {
        itemId: draggableId,
        from: sourceCategory,
        to: destinationCategory
      });

      dispatch(moveItem({
        itemId: parseInt(draggableId),
        newCategory: destinationCategory
      }));
    }
  }, [dispatch]);

  const onDragEnd = (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;

    const draggedItem = itemsArray.find((item: any) => item.id === parseInt(draggableId));
    if (!draggedItem) return;

    dispatch(updateItem({ ...draggedItem, category: destination.droppableId as Category }));
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {isLoading ? (
        <Box display="flex" justifyContent="center">
          <CircularProgress />
        </Box>
      ) : (
        <DragDropContext onDragStart={handleDragStart} onDragEnd={onDragEnd}>
          <Grid container spacing={3}>
            {CATEGORIES.map((category) => (
              <Grid item xs={12} sm={6} md={3} key={category.droppableId}>
                <Paper 
                  elevation={3} 
                  sx={{ 
                    p: 2, 
                    height: '100%',
                    backgroundColor: `${category.color}15`,
                    borderTop: `3px solid ${category.color}`
                  }}
                >
                  <Box display="flex" alignItems="center" mb={2}>
                    <category.icon sx={{ color: category.color, mr: 1 }} />
                    <Typography variant="h6" component="h2">
                      {category.label}
                    </Typography>
                  </Box>
                  
                  <DroppableContainer
                    droppableId={category.droppableId}
                    category={category.type}
                    items={itemsArray}
                    isDragEnabled={isDragEnabled}
                    color={category.color}
                  />
                </Paper>
              </Grid>
            ))}
          </Grid>
        </DragDropContext>
      )}
    </Box>
  );
};

export default CategorizedContent;
