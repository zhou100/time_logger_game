import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  IconButton,
  Box,
  TextField,
  Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import { ContentItem } from '../store/contentSlice';
import { useDispatch } from 'react-redux';
import { removeItem, updateItem } from '../store/contentSlice';
import Logger from '../utils/logger';

interface ContentCardProps {
  item: ContentItem;
  categoryColor?: string;
  isDragging?: boolean;
}

const ContentCard: React.FC<ContentCardProps> = ({ 
  item, 
  categoryColor = '#000000', 
  isDragging = false 
}) => {
  const dispatch = useDispatch();
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(item.text);

  const handleDelete = () => {
    dispatch(removeItem(item.id));
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedText(item.text);
  };

  const handleSave = () => {
    if (editedText.trim() !== '') {
      Logger.debug('Saving edited text:', { id: item.id, text: editedText });
      dispatch(updateItem({ ...item, text: editedText.trim() }));
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedText(item.text);
  };

  return (
    <Card 
      sx={{ 
        mb: 1,
        transition: 'all 0.2s ease',
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        boxShadow: isDragging ? 4 : 1,
        borderLeft: `4px solid ${categoryColor}`,
        '&:hover': {
          boxShadow: 2,
        }
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {isEditing ? (
          <Box>
            <TextField
              fullWidth
              multiline
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              size="small"
              autoFocus
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Tooltip title="Save">
                <IconButton size="small" onClick={handleSave} color="primary">
                  <SaveIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Cancel">
                <IconButton size="small" onClick={handleCancel} color="error">
                  <CancelIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        ) : (
          <Box>
            <Typography 
              variant="body2" 
              sx={{ 
                wordBreak: 'break-word',
                color: 'text.primary'
              }}
            >
              {item.text}
            </Typography>
            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: 1, 
                mt: 1,
                opacity: 0.7,
                '&:hover': {
                  opacity: 1
                }
              }}
            >
              <Tooltip title="Edit">
                <IconButton size="small" onClick={handleEdit}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={handleDelete} color="error">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default ContentCard;
