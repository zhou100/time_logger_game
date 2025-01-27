import { Category } from '../../src/types/api';

describe('Drag and Drop E2E Tests', () => {
  beforeEach(() => {
    // Mock API responses for audio recording
    cy.intercept('POST', '/api/recordings', {
      statusCode: 200,
      body: {
        id: 'test-recording-1',
        content: 'Test recording content',
        category: Category.TODO,
        timestamp: new Date().toISOString()
      }
    }).as('createRecording');

    // Visit the main page
    cy.visit('/');
  });

  it('should create a recording and drag it between categories', () => {
    // Start recording
    cy.get('[data-testid="record-button"]').click();

    // Wait for recording to complete (adjust timing as needed)
    cy.wait(3000);

    // Stop recording
    cy.get('[data-testid="stop-button"]').click();

    // Wait for API response
    cy.wait('@createRecording');

    // Verify item appears in TODO category
    cy.get(`[data-testid="droppable-${Category.TODO}"]`)
      .find('[data-testid="draggable-test-recording-1"]')
      .should('exist');

    // Drag item to THOUGHT category
    cy.get('[data-testid="draggable-test-recording-1"]')
      .drag(`[data-testid="droppable-${Category.THOUGHT}"]`);

    // Verify item moved to THOUGHT category
    cy.get(`[data-testid="droppable-${Category.THOUGHT}"]`)
      .find('[data-testid="draggable-test-recording-1"]')
      .should('exist');

    // Verify item is no longer in TODO category
    cy.get(`[data-testid="droppable-${Category.TODO}"]`)
      .find('[data-testid="draggable-test-recording-1"]')
      .should('not.exist');
  });

  it('handles multiple recordings and drag operations', () => {
    // Create first recording
    cy.get('[data-testid="record-button"]').click();
    cy.wait(3000);
    cy.get('[data-testid="stop-button"]').click();
    cy.wait('@createRecording');

    // Create second recording
    cy.get('[data-testid="record-button"]').click();
    cy.wait(3000);
    cy.get('[data-testid="stop-button"]').click();
    cy.wait('@createRecording');

    // Drag first recording to THOUGHT
    cy.get('[data-testid="draggable-test-recording-1"]')
      .drag(`[data-testid="droppable-${Category.THOUGHT}"]`);

    // Verify first recording moved
    cy.get(`[data-testid="droppable-${Category.THOUGHT}"]`)
      .find('[data-testid="draggable-test-recording-1"]')
      .should('exist');

    // Drag second recording to CHAT
    cy.get('[data-testid="draggable-test-recording-2"]')
      .drag(`[data-testid="droppable-${Category.CHAT}"]`);

    // Verify second recording moved
    cy.get(`[data-testid="droppable-${Category.CHAT}"]`)
      .find('[data-testid="draggable-test-recording-2"]')
      .should('exist');
  });

  it('handles error states gracefully', () => {
    // Mock API error
    cy.intercept('POST', '/api/recordings', {
      statusCode: 500,
      body: { error: 'Internal Server Error' }
    }).as('recordingError');

    // Attempt recording
    cy.get('[data-testid="record-button"]').click();
    cy.wait(3000);
    cy.get('[data-testid="stop-button"]').click();

    // Wait for error response
    cy.wait('@recordingError');

    // Verify error is displayed
    cy.get('[role="alert"]').should('contain', 'Error creating recording');
  });

  it('preserves category assignments after page reload', () => {
    // Create recording
    cy.get('[data-testid="record-button"]').click();
    cy.wait(3000);
    cy.get('[data-testid="stop-button"]').click();
    cy.wait('@createRecording');

    // Drag to THOUGHT category
    cy.get('[data-testid="draggable-test-recording-1"]')
      .drag(`[data-testid="droppable-${Category.THOUGHT}"]`);

    // Reload page
    cy.reload();

    // Verify item remains in THOUGHT category
    cy.get(`[data-testid="droppable-${Category.THOUGHT}"]`)
      .find('[data-testid="draggable-test-recording-1"]')
      .should('exist');
  });
});
