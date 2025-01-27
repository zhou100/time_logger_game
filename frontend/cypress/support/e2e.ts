import '@4tw/cypress-drag-drop';

// Add custom commands here
Cypress.Commands.add('dragAndDrop', { prevSubject: 'element' }, (subject, targetSelector) => {
  cy.wrap(subject).drag(targetSelector);
});
