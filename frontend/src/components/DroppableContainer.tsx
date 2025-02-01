import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import { ContentItem } from '../store/contentSlice';
import { Category } from '../types/api';
import Logger from '../utils/logger';
import ContentCard from './ContentCard';
import DragErrorBoundary from './DragErrorBoundary';

interface DroppableContainerProps {
  droppableId: string;
  category: Category;
  items: ContentItem[];
  isDragEnabled: boolean;
  color: string;
  isLoading?: boolean;
}

const DroppableContainer: React.FC<DroppableContainerProps> = ({
  droppableId,
  category,
  items,
  isDragEnabled,
  color,
  isLoading,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Verify props on mount and update
  useEffect(() => {
    Logger.debug(`DroppableContainer props updated for ${droppableId}:`, {
      category,
      droppableId,
      itemCount: items.filter(i => i.category === category).length,
      isDragEnabled,
      validCategories: Object.values(Category),
      itemCategories: items.map(i => i.category)
    });

    // Verify that droppableId matches a valid Category
    if (!Object.values(Category).includes(droppableId as Category)) {
      Logger.error(`Invalid droppableId: ${droppableId}`, {
        validCategories: Object.values(Category)
      });
    }

    return () => {
      Logger.debug(`DroppableContainer unmounting: ${droppableId}`);
    };
  }, [droppableId, category, items, isDragEnabled]);

  useEffect(() => {
    if (!containerRef.current) {
      Logger.error('Failed to attach container ref', {
        droppableId,
        category
      });
    }
  }, [containerRef, droppableId, category]);

  const filteredItems = items.filter(item => item.category === category);
  
  console.log('DroppableContainer rendered with items:', items);

  return (
    <Box
      sx={{
        minHeight: '100px',
        padding: '8px',
        backgroundColor: 'transparent',
      }}
      data-testid={`droppable-${droppableId}`}
    >
      <DragErrorBoundary>
        <DragErrorBoundary>
          <Droppable droppableId={droppableId}>
            {(provided, snapshot) => {
              Logger.debug(`Rendering Droppable content for ${droppableId}:`, {
                isDraggingOver: snapshot.isDraggingOver,
                itemCount: filteredItems.length,
                items: filteredItems.map(i => ({
                  id: i.id,
                  category: i.category
                }))
              });

              return (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  data-testid={`droppable-content-${droppableId}`}
                >
                  <Box
                    sx={{
                      minHeight: 200,
                      padding: '8px',
                      transition: 'background-color 0.2s ease',
                      backgroundColor: snapshot.isDraggingOver ? `${color}30` : 'transparent',
                      ...(isLoading && { 
                        opacity: 0.5,
                        pointerEvents: 'none'
                      })
                    }}
                  >
                    {isLoading && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                        <CircularProgress />
                      </Box>
                    )}
                    {filteredItems.map((item, index) => (
                      <Draggable
                        key={item.id}
                        draggableId={String(item.id)}
                        index={index}
                        isDragDisabled={!isDragEnabled}
                      >
                        {(provided, snapshot) => (
                         <Box
                         ref={provided.innerRef}
                         {...provided.draggableProps}
                         {...provided.dragHandleProps}
                       >
                         <ContentCard
                           item={item}
                           isDragging={snapshot.isDragging}
                           index={index}
                           isDragEnabled={isDragEnabled}
                         />
                       </Box>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </Box>
                </div>
              );
            }}
          </Droppable>
        </DragErrorBoundary>
      </DragErrorBoundary>
    </Box>
  );
};

export default DroppableContainer;
