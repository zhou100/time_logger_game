import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import Logger from '../utils/logger';
import { Category } from '../types/api';

export interface ContentItem {
  id: number;
  text: string;
  category: Category;  
  timestamp: string;
}

interface ContentState {
  items: ContentItem[];
  isLoading: boolean;
  error: string | null;
}

const initialState: ContentState = {
  items: [],
  isLoading: false,
  error: null,
};

export const contentSlice = createSlice({
  name: 'content',
  initialState,
  reducers: {
    addItem: (state, action: PayloadAction<ContentItem>) => {
      Logger.debug('Adding item:', {
        id: action.payload.id,
        category: action.payload.category,
        text: action.payload.text.substring(0, 50) + '...'
      });
      state.items.push(action.payload);
    },
    removeItem: (state, action: PayloadAction<number>) => {
      Logger.debug('Removing item:', action.payload);
      state.items = state.items.filter(item => item.id !== action.payload);
    },
    updateItem: (state, action: PayloadAction<ContentItem>) => {
      const index = state.items.findIndex(item => item.id === action.payload.id);
      if (index !== -1) {
        Logger.debug('Updating item:', {
          id: action.payload.id,
          oldCategory: state.items[index].category,
          newCategory: action.payload.category
        });
        state.items[index] = action.payload;
      }
    },
    moveItem: (state, action: PayloadAction<{ itemId: number; newCategory: Category }>) => {
      const { itemId, newCategory } = action.payload;
      
      if (!Object.values(Category).includes(newCategory)) {
        Logger.error('Invalid category:', {
          category: newCategory,
          validCategories: Object.values(Category)
        });
        return;
      }

      const item = state.items.find(item => item.id === itemId);
      if (item) {
        Logger.debug('Moving item:', {
          itemId,
          oldCategory: item.category,
          newCategory
        });
        item.category = newCategory;
      } else {
        Logger.error('Item not found:', itemId);
      }
    },
    setItems: (state, action: PayloadAction<ContentItem[]>) => {
      Logger.debug('Setting items:', {
        count: action.payload.length,
        categories: action.payload.map(item => item.category)
      });
      state.items = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  addItem,
  removeItem,
  updateItem,
  moveItem,
  setItems,
  setLoading,
  setError,
  clearError,
} = contentSlice.actions;

export default contentSlice.reducer;
