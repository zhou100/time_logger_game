import { act, render, screen } from '@testing-library/react';
import { DragDropContext } from 'react-beautiful-dnd';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import DroppableContainer from '../DroppableContainer';
import { Category } from '../../types/api';
import contentReducer from '../../store/contentSlice';
import '@testing-library/jest-dom';

// Mock the logger
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Create a mock store for testing
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      content: contentReducer
    },
    preloadedState: {
      content: {
        items: [],
        ...initialState
      }
    }
  });
};

// Wrap component with DragDropContext and Redux Provider for testing
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = createMockStore();
  return (
    <Provider store={store}>
      <DragDropContext onDragEnd={() => {}}>
        {children}
      </DragDropContext>
    </Provider>
  );
};

describe('DroppableContainer', () => {
  const defaultProps = {
    droppableId: Category.TODO,
    category: Category.TODO,
    items: [
      {
        id: 1,
        text: 'Test content',
        category: Category.TODO,
        timestamp: new Date().toISOString()
      }
    ],
    isDragEnabled: true,
    color: '#e57373'
  };

  // Test 1: Basic render test
  test('renders with correct droppableId', () => {
    render(
      <TestWrapper>
        <DroppableContainer {...defaultProps} />
      </TestWrapper>
    );

    const container = screen.getByTestId(`droppable-content-${Category.TODO}`);
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('data-rbd-droppable-id', Category.TODO);
  });

  // Test 2: Items render test
  test('renders items correctly', () => {
    render(
      <TestWrapper>
        <DroppableContainer {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('draggable-1')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  // Test 3: Drag disabled test
  test('disables drag when isDragEnabled is false', () => {
    render(
      <TestWrapper>
        <DroppableContainer {...defaultProps} isDragEnabled={false} />
      </TestWrapper>
    );

    const draggableItem = screen.getByTestId('draggable-1');
    expect(draggableItem).toHaveStyle({ opacity: 0.6, cursor: 'not-allowed' });
  });

  // Test 4: Empty state test
  test('renders empty state when no items', () => {
    render(
      <TestWrapper>
        <DroppableContainer {...defaultProps} items={[]} />
      </TestWrapper>
    );

    expect(screen.queryByTestId('draggable-1')).not.toBeInTheDocument();
  });

  // Test 5: Category filtering test
  test('only renders items matching the category', () => {
    const mixedItems = [
      {
        id: 1,
        text: 'TODO item',
        category: Category.TODO,
        timestamp: new Date().toISOString()
      },
      {
        id: 2,
        text: 'IDEA item',
        category: Category.IDEA,
        timestamp: new Date().toISOString()
      }
    ];

    render(
      <TestWrapper>
        <DroppableContainer {...defaultProps} items={mixedItems} />
      </TestWrapper>
    );

    expect(screen.getByText('TODO item')).toBeInTheDocument();
    expect(screen.queryByText('IDEA item')).not.toBeInTheDocument();
  });

  // Test 6: Container styles test
  test('has correct container styles', () => {
    render(
      <TestWrapper>
        <DroppableContainer {...defaultProps} />
      </TestWrapper>
    );

    const container = screen.getByTestId(`droppable-content-${Category.TODO}`);
    expect(container).toHaveAttribute('data-rbd-droppable-id', Category.TODO);
    expect(container).toHaveStyle({ 
      minHeight: '200px',
      backgroundColor: 'transparent'
    });
  });
});
