import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
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

// Helper function to simulate drag and drop
const simulateDragAndDrop = async (source: HTMLElement, destination: HTMLElement) => {
  fireEvent.dragStart(source);
  fireEvent.dragEnter(destination);
  fireEvent.dragOver(destination);
  fireEvent.drop(destination);
  fireEvent.dragEnd(source);

  // Wait for React to process the updates
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('Category-specific Drag and Drop Tests', () => {
  jest.setTimeout(10000); // Increase timeout to 10 seconds

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    cleanup();
  });

  // Test 1: Verify all category containers are rendered
  test('renders all category containers', () => {
    const mockStore = createMockStore({ content: mockItems });

    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="TEST">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <CategorizedContent />
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    // Check if all category containers are present
    Object.values(Category).forEach(category => {
      const container = screen.getByTestId(`droppable-content-${category}`);
      expect(container).toBeInTheDocument();
    });
  });

  // Test 2: Verify items are in correct initial categories
  test('renders items in their correct initial categories', async () => {
    const mockStore = createMockStore({ content: mockItems });

    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="TEST">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <CategorizedContent />
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    // Check if each item is in its correct container
    await Promise.all(mockItems.items.map(async item => {
      await waitFor(() => {
        expect(screen.getByTestId(`draggable-${item.id}`)).toBeInTheDocument();
      }, { timeout: 3000 });
      const container = screen.getByTestId(`droppable-content-${item.category}`);
      const draggableItem = screen.getByTestId(`draggable-${item.id}`);
      expect(container).toContainElement(draggableItem);
    }));
  });

  // Test 3: Test dragging to THOUGHT category
  test('can drag item to THOUGHT category', async () => {
    const mockStore = createMockStore({ content: mockItems });
    const store = mockStore;

    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="TEST">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <CategorizedContent />
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    await waitFor(() => {
      expect(screen.getByTestId('draggable-1')).toBeInTheDocument();
    }, { timeout: 3000 });

    const todoItem = screen.getByTestId('draggable-1');
    const thoughtContainer = screen.getByTestId(`droppable-content-${Category.THOUGHT}`);

    await simulateDragAndDrop(todoItem, thoughtContainer);

    // Verify the item has moved in the DOM
    await waitFor(() => {
      expect(thoughtContainer).toContainElement(todoItem);
    }, { timeout: 3000 });

    // Verify state synchronization
    await waitFor(() => {
      const state = store.getState().content;
      console.log('Redux State After Drag:', state);
      expect(state.items.find(i => i.id === 1)?.category).toBe(Category.THOUGHT);
    });
  });

  // Test 4: Test dragging from THOUGHT category
  test('can drag item from THOUGHT category', async () => {
    const mockStore = createMockStore({ content: mockItems });
    const store = mockStore;

    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="TEST">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <CategorizedContent />
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    await waitFor(() => {
      expect(screen.getByTestId('draggable-2')).toBeInTheDocument();
    }, { timeout: 3000 });

    const thoughtItem = screen.getByTestId('draggable-2');
    const todoContainer = screen.getByTestId(`droppable-content-${Category.TODO}`);

    await simulateDragAndDrop(thoughtItem, todoContainer);

    // Verify the item has moved in the DOM
    await waitFor(() => {
      expect(todoContainer).toContainElement(thoughtItem);
    }, { timeout: 3000 });

    // Verify state synchronization
    await waitFor(() => {
      const state = store.getState().content;
      console.log('Redux State After Drag:', state);
      expect(state.items.find(i => i.id === 2)?.category).toBe(Category.TODO);
    });
  });

  // Test 5: Verify category IDs match enum values
  test('category IDs match Category enum values', () => {
    const mockStore = createMockStore({ content: mockItems });

    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="TEST">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <CategorizedContent />
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    Object.values(Category).forEach(category => {
      const container = screen.getByTestId(`droppable-content-${category}`);
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('data-rbd-droppable-id', category);
    });
  });
});
