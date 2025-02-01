import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from './theme';
import { AuthProvider } from './contexts/AuthContext';

// Updated test without BrowserRouter wrapper

test('App renders main content correctly', () => {
  render(
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </Provider>
  );
  // Check for the existence of the main content area defined with role="main"
  /* Update main content query to be more specific */
  const mainElement = screen.getByRole('main', { name: 'main-content' });
  expect(mainElement).toBeInTheDocument();
});
