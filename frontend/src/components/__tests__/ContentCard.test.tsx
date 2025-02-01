import React, { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ContentCard from '../ContentCard';
import { Category } from '../../types/api';
import contentReducer from '../../store/contentSlice';
import '@testing-library/jest-dom';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

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
const mockItem = {
  id: 1,
  text: 'Test content',
  category: Category.TODO,
  timestamp: new Date().toISOString()
};

describe('ContentCard', () => {
  const mockStore = createMockStore();

  // Test 1: Basic render test
  test('renders item content correctly', () => {
    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="test">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <Draggable draggableId="1" index={0}>
                  {(provided) => (
                    <div
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      ref={provided.innerRef}
                    >
                      <ContentCard item={mockItem} index={0} />
                    </div>
                  )}
                </Draggable>
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    expect(screen.getByText(mockItem.text)).toBeInTheDocument();
  });

  // Test 2: Edit mode test
  test('enters edit mode and updates content', () => {
    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="test">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <Draggable draggableId="1" index={0}>
                  {(provided) => (
                    <div
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      ref={provided.innerRef}
                    >
                      <ContentCard item={mockItem} index={0} />
                    </div>
                  )}
                </Draggable>
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    // Enter edit mode
    fireEvent.click(screen.getByTestId('edit-button'));
    
    // Find and update the text field
    const textField = screen.getByRole('textbox');
    fireEvent.change(textField, { target: { value: 'Updated content' } });
    
    // Save changes
    fireEvent.click(screen.getByTestId('save-button'));
    
    // Verify the content is updated
    expect(screen.getByText('Updated content')).toBeInTheDocument();
  });

  // Test 3: Delete test
  test('handles delete action', () => {
    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="test">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <Draggable draggableId="1" index={0}>
                  {(provided) => (
                    <div
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      ref={provided.innerRef}
                    >
                      <ContentCard item={mockItem} index={0} />
                    </div>
                  )}
                </Draggable>
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    fireEvent.click(screen.getByTestId('delete-button'));
    // The actual deletion would be handled by Redux
  });

  // Test 4: Cancel edit test
  test('cancels edit mode without saving changes', () => {
    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="test">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <Draggable draggableId="1" index={0}>
                  {(provided) => (
                    <div
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      ref={provided.innerRef}
                    >
                      <ContentCard item={mockItem} index={0} />
                    </div>
                  )}
                </Draggable>
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    // Enter edit mode
    fireEvent.click(screen.getByTestId('edit-button'));
    
    // Change the text
    const textField = screen.getByRole('textbox');
    fireEvent.change(textField, { target: { value: 'Canceled content' } });
    
    // Cancel edit
    fireEvent.click(screen.getByTestId('cancel-button'));
    
    // Verify original content remains
    expect(screen.getByText(mockItem.text)).toBeInTheDocument();
    expect(screen.queryByText('Canceled content')).not.toBeInTheDocument();
  });

  // Test 5: Category color test
  test('applies category color correctly', () => {
    const categoryColor = '#ff0000';
    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="test">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <Draggable draggableId="1" index={0}>
                  {(provided) => (
                    <div
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      ref={provided.innerRef}
                    >
                      <ContentCard item={mockItem} index={0} categoryColor={categoryColor} />
                    </div>
                  )}
                </Draggable>
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    const card = screen.getByTestId('content-card');
    expect(card).toHaveStyle({ borderLeft: `4px solid ${categoryColor}` });
  });

  // Test 6: Drag state test
  test('applies drag styling when dragging', () => {
    render(
      <DragDropContext onDragEnd={jest.fn()}>
        <Droppable droppableId="test">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <Provider store={mockStore}>
                <Draggable draggableId="1" index={0}>
                  {(provided) => (
                    <div
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      ref={provided.innerRef}
                    >
                      <ContentCard item={mockItem} index={0} isDragging={true} />
                    </div>
                  )}
                </Draggable>
              </Provider>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );

    const card = screen.getByTestId('content-card');
    expect(card).toHaveStyle({ transform: 'scale(1.02)' });
  });
});
