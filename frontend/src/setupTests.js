// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Polyfill for URL.createObjectURL required for react-media-recorder and other modules
if (!global.URL.createObjectURL) {
  global.URL.createObjectURL = () => '';
}

// Mock react-media-recorder to avoid testing errors in Jest environment
jest.mock('react-media-recorder', () => ({
  useReactMediaRecorder: () => ({
    status: 'idle',
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    mediaBlobUrl: '',
  }),
}));

// You can add more global mocks or configuration here as needed
