import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './theme';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import RecordingPage from './pages/RecordingPage';
import NavBar from './components/NavBar';
import { Box } from '@mui/material';
import './styles/errorBoundaries.css';

function App() {
  return (
    <Provider store={store}>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AuthProvider>
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: '100vh',
                // Remove any potential aria-hidden inheritance
                '& > *': {
                  '&[aria-hidden="true"]': {
                    '& button, & [tabindex]': {
                      visibility: 'hidden',
                    },
                  },
                },
              }}
            >
              <NavBar />
              <Box 
                aria-label="main-content"
                sx={{ 
                  flexGrow: 1,
                  position: 'relative',
                  zIndex: 1 // Ensure proper stacking context
                }}
                role="main"
                tabIndex={-1} // Makes the main content area focusable for accessibility
              >
                <Routes>
                  <Route path="/login" element={<LoginForm />} />
                  <Route path="/register" element={<RegisterForm />} />
                  <Route path="/" element={
                    <ProtectedRoute>
                      <RecordingPage />
                    </ProtectedRoute>
                  } />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Box>
            </Box>
          </AuthProvider>
        </ThemeProvider>
      </Router>
    </Provider>
  );
}

export default App;
