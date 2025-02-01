import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { DragDropContext } from 'react-beautiful-dnd';
import { configureStore } from '@reduxjs/toolkit';
import CategorizedContent from '../CategorizedContent';
import { Category } from '../../types/api';

// Helper function to simulate drag and drop
const simulateDragAndDrop = async (source: HTMLElement, destination: HTMLElement) => {
  fireEvent.dragStart(source);
  fireEvent.dragEnter(destination);
  fireEvent.dragOver(destination);
  fireEvent.drop(destination);
  fireEvent.dragEnd(source);

  // Wait for React to process the updates
  await new Promise(resolve => setTimeout(resolve, 50));
};

describe('Drag and Drop Integration Tests', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // Mock data
  const mockItems = {
    items: [
      {
        id: 1,
        title: 'Test TODO item',
        category: Category.TODO,
        timestamp: new Date().toISOString()
      },
      {
        id: 2,
        title: 'Test THOUGHT item',
        category: Category.THOUGHT,
        timestamp: new Date().toISOString()
      }
    ],
    isLoading: false,
    error: null
  };

  // Test 1: Full drag and drop interaction
  test('moves item between categories', async () => {
    const mockStore = configureStore({
      reducer: {
        content: (state = mockItems, action) => {
          if (action.type === 'content/moveItem') {
            const { itemId, targetCategory } = action.payload;
            return {
              ...state,
              items: state.items.map(item =>
                item.id === itemId ? { ...item, category: targetCategory } : item
              )
            };
          }
          return state;
        }
      }
    });

    render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    // Wait for items to be rendered
    await waitFor(() => {
      expect(screen.getByTestId('draggable-1')).toBeInTheDocument();
      expect(screen.getByTestId('draggable-2')).toBeInTheDocument();
    });

    const todoItem = screen.getByTestId('draggable-1');
    const thoughtContainer = screen.getByTestId(`droppable-content-${Category.THOUGHT}`);

    // Simulate drag and drop
    await simulateDragAndDrop(todoItem, thoughtContainer);

    // Verify the item has moved in both DOM and state
    await waitFor(() => {
      expect(thoughtContainer).toContainElement(todoItem);
      const state = mockStore.getState();
      expect(state.content.items.find(i => i.id === 1)?.category).toBe(Category.THOUGHT);
    });
  });

  // Test 2: Loading state during drag
  test('prevents drag when loading', () => {
    const loadingStore = configureStore({
      reducer: {
        content: (state = { ...mockItems, isLoading: true }, action) => state
      }
    });

    render(
      <Provider store={loadingStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    // Verify containers have loading styles
    Object.values(Category).forEach(category => {
      const container = screen.getByTestId(`droppable-content-${category}`);
      expect(container).toHaveStyle({ opacity: '0.5', pointerEvents: 'none' });
    });
  });
});
