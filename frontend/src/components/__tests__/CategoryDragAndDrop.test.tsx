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

describe('Category-specific Drag and Drop Tests', () => {
  // Test data with items in each category
  const mockItems = {
    items: [
      {
        id: 1,
        text: 'Test TODO item',
        category: Category.TODO,
        timestamp: new Date().toISOString()
      },
      {
        id: 2,
        text: 'Test THOUGHT item',
        category: Category.THOUGHT,
        timestamp: new Date().toISOString()
      },
      {
        id: 3,
        text: 'Test IDEA item',
        category: Category.IDEA,
        timestamp: new Date().toISOString()
      }
    ],
    isLoading: false,
    error: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Verify all category containers are rendered
  test('renders all category containers', () => {
    const mockStore = createMockStore({ content: mockItems });

    render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    // Check if all category containers are present
    Object.values(Category).forEach(category => {
      const container = screen.getByTestId(`droppable-${category}`);
      expect(container).toBeInTheDocument();
    });
  });

  // Test 2: Verify items are in correct initial categories
  test('renders items in their correct initial categories', () => {
    const mockStore = createMockStore({ content: mockItems });

    render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    // Check if each item is in its correct container
    mockItems.items.forEach(item => {
      const container = screen.getByTestId(`droppable-${item.category}`);
      const draggableItem = screen.getByTestId(`draggable-${item.id}`);
      expect(container).toContainElement(draggableItem);
    });
  });

  // Test 3: Test dragging to THOUGHT category
  test('can drag item to THOUGHT category', () => {
    const mockStore = createMockStore({ content: mockItems });

    render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    const todoItem = screen.getByTestId('draggable-1');
    const thoughtContainer = screen.getByTestId(`droppable-${Category.THOUGHT}`);

    simulateDragAndDrop(todoItem, thoughtContainer);
    expect(thoughtContainer).toContainElement(todoItem);
  });

  // Test 4: Test dragging from THOUGHT category
  test('can drag item from THOUGHT category', () => {
    const mockStore = createMockStore({ content: mockItems });

    render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    const thoughtItem = screen.getByTestId('draggable-2');
    const todoContainer = screen.getByTestId(`droppable-${Category.TODO}`);

    simulateDragAndDrop(thoughtItem, todoContainer);
    expect(todoContainer).toContainElement(thoughtItem);
  });

  // Test 5: Verify category IDs match enum values
  test('category IDs match Category enum values', () => {
    const mockStore = createMockStore({ content: mockItems });

    render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    Object.values(Category).forEach(category => {
      const container = screen.getByTestId(`droppable-${category}`);
      expect(container).toHaveAttribute('data-rbd-droppable-id', category);
    });
  });
});
