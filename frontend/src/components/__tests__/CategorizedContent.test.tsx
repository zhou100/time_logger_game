import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DragDropContext } from 'react-beautiful-dnd';
import CategorizedContent from '../CategorizedContent';
import contentReducer from '../../store/contentSlice';
import { Category } from '../../types/api';
import '@testing-library/jest-dom';

// Mock the logger to avoid console noise during tests
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

describe('CategorizedContent', () => {
  const mockStore = createMockStore({
    content: mockItems
  });

  // Test 1: Basic render test
  test('renders all droppable containers with correct IDs', () => {
    render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    // Check that all category containers are rendered
    [Category.TODO, Category.IDEA, Category.THOUGHT, Category.TIME_RECORD].forEach(category => {
      const container = screen.getByTestId(`droppable-${category}`);
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('data-rbd-droppable-id', category);
    });
  });

  // Test 2: Item render test
  test('renders draggable item in correct container', () => {
    render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    // Verify the test item is in the TODO container
    const todoContainer = screen.getByTestId(`droppable-${Category.TODO}`);
    const item = screen.getByTestId('draggable-1');
    expect(todoContainer).toContainElement(item);
  });

  // Test 3: Loading state
  test('shows loading indicator when loading is true', () => {
    const loadingStore = createMockStore({
      content: {
        items: [],
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

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  // Test 4: Error state
  test('shows error message when error exists', () => {
    const errorStore = createMockStore({
      content: {
        items: [],
        isLoading: false,
        error: 'Test error message'
      }
    });

    render(
      <Provider store={errorStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  // Test 5: Category headers
  test('renders category headers with correct labels', () => {
    render(
      <Provider store={mockStore}>
        <DragDropContext onDragEnd={() => {}}>
          <CategorizedContent />
        </DragDropContext>
      </Provider>
    );

    expect(screen.getByText('TODOs')).toBeInTheDocument();
    expect(screen.getByText('Ideas')).toBeInTheDocument();
    expect(screen.getByText('Thoughts')).toBeInTheDocument();
    expect(screen.getByText('Time Records')).toBeInTheDocument();
  });
});
