import React from 'react';
import { Box } from '@mui/material';
import { Draggable } from 'react-beautiful-dnd';
import { ContentItem } from '../store/contentSlice';
import ContentCard from './ContentCard';
import Logger from '../utils/logger';

interface DraggableItemProps {
  item: ContentItem;
  index: number;
  isDragDisabled: boolean;
  color: string;
}

const DraggableItem: React.FC<DraggableItemProps> = ({
  item,
  index,
  isDragDisabled,
  color
}) => {
  return (
    <Draggable 
      draggableId={String(item.id)} 
      index={index}
      isDragDisabled={isDragDisabled}
    >
      {(provided, snapshot) => {
        Logger.debug(`Rendering Draggable item ${item.id}:`, {
          index,
          isDragging: snapshot.isDragging,
          isDragDisabled
        });

        return (
          <Box
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            data-testid={`draggable-${item.id}`}
            sx={{
              mb: 1,
              opacity: isDragDisabled ? 0.6 : 1,
              cursor: isDragDisabled ? 'not-allowed' : 'grab',
              transform: snapshot.isDragging ? 'scale(1.02)' : 'none',
              transition: 'transform 0.2s ease'
            }}
          >
            <ContentCard 
              item={item}
              categoryColor={color}
              isDragging={snapshot.isDragging}
            />
          </Box>
        );
      }}
    </Draggable>
  );
};

export default DraggableItem;
