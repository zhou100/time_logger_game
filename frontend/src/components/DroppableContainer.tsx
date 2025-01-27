import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { Droppable } from 'react-beautiful-dnd';
import { ContentItem } from '../store/contentSlice';
import { Category } from '../types/api';
import Logger from '../utils/logger';
import DraggableItem from './DraggableItem';

interface DroppableContainerProps {
  droppableId: string;
  category: Category;
  items: ContentItem[];
  isDragEnabled: boolean;
  color: string;
}

const DroppableContainer: React.FC<DroppableContainerProps> = ({
  droppableId,
  category,
  items,
  isDragEnabled,
  color
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

  const filteredItems = items.filter(item => item.category === category);
  
  return (
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
          <Box
            ref={provided.innerRef}
            {...provided.droppableProps}
            data-testid={`droppable-${droppableId}`}
            minHeight="200px"
            sx={{ 
              transition: 'background-color 0.2s ease',
              backgroundColor: snapshot.isDraggingOver ? `${color}30` : 'transparent',
              border: '1px dashed transparent',
              '&:hover': {
                border: `1px dashed ${color}`
              }
            }}
          >
            {filteredItems.map((item, index) => (
              <DraggableItem
                key={item.id}
                item={item}
                index={index}
                isDragDisabled={!isDragEnabled}
                color={color}
              />
            ))}
            {provided.placeholder}
          </Box>
        );
      }}
    </Droppable>
  );
};

export default DroppableContainer;
