import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DragDropContext } from 'react-beautiful-dnd';
import CategorizedContent from '../CategorizedContent';
import contentReducer from '../../store/contentSlice';
import { Category } from '../../types/api';
import '@testing-library/jest-dom';

// Mock the logger
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock store setup
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      content: contentReducer
    },
    preloadedState: initialState
  });
};

// Mock data
const mockItems = {
  items: [
    {
      id: 1,
      text: 'Test TODO item',
      category: Category.TODO,
      timestamp: new Date().toISOString()
    }
  ],
  isLoading: false,
  error: null
};

// Helper function to simulate drag and drop
const simulateDragAndDrop = (source: HTMLElement, destination: HTMLElement) => {
  // Start drag
  fireEvent.mouseDown(source);
  fireEvent.dragStart(source);

  // Move over destination
  fireEvent.dragEnter(destination);
  fireEvent.dragOver(destination);

  // Drop
  fireEvent.drop(destination);
  fireEvent.dragEnd(source);
};

describe('Drag and Drop Integration', () => {
  // Mock store with initial state
  const mockStore = createMockStore({
    content: mockItems
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  // Test 1: Full drag and drop interaction
  test('moves item between categories', async () => {
    const { container } = render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    // Get source and destination containers
    const sourceContainer = screen.getByTestId(`droppable-${Category.TODO}`);
    const destinationContainer = screen.getByTestId(`droppable-${Category.IDEA}`);
    const draggableItem = screen.getByTestId('draggable-1');

    // Simulate drag and drop
    simulateDragAndDrop(draggableItem, destinationContainer);

    // Verify item is now in IDEA container
    expect(destinationContainer).toContainElement(draggableItem);
    expect(sourceContainer).not.toContainElement(draggableItem);
  });

  // Test 2: Multiple drag operations
  test('handles multiple drag operations correctly', () => {
    const multipleItemsStore = createMockStore({
      content: {
        items: [
          {
            id: 1,
            text: 'Test TODO item',
            category: Category.TODO,
            timestamp: new Date().toISOString()
          },
          {
            id: 2,
            text: 'Test IDEA item',
            category: Category.IDEA,
            timestamp: new Date().toISOString()
          }
        ],
        isLoading: false,
        error: null
      }
    });

    render(
      <Provider store={multipleItemsStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    const item1 = screen.getByTestId('draggable-1');
    const item2 = screen.getByTestId('draggable-2');
    const ideaContainer = screen.getByTestId(`droppable-${Category.IDEA}`);
    const todoContainer = screen.getByTestId(`droppable-${Category.TODO}`);

    // Move item1 to IDEA
    simulateDragAndDrop(item1, ideaContainer);
    expect(ideaContainer).toContainElement(item1);

    // Move item2 to TODO
    simulateDragAndDrop(item2, todoContainer);
    expect(todoContainer).toContainElement(item2);
  });

  // Test 3: Redux state update
  test('updates Redux state after drag and drop', () => {
    const { store } = render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    const draggableItem = screen.getByTestId('draggable-1');
    const ideaContainer = screen.getByTestId(`droppable-${Category.IDEA}`);

    // Perform drag and drop
    simulateDragAndDrop(draggableItem, ideaContainer);

    // Verify Redux state
    const state = store.getState();
    expect(state.content.items[0].category).toBe(Category.IDEA);
  });

  // Test 4: Loading state
  test('disables drag during loading', () => {
    const loadingStore = createMockStore({
      content: {
        items: mockItems.items,
        isLoading: true,
        error: null
      }
    });

    render(
      <Provider store={loadingStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    const draggableItem = screen.getByTestId('draggable-1');
    expect(draggableItem).toHaveAttribute('aria-disabled', 'true');
  });
});
