import '@testing-library/jest-dom';
import { vi } from 'vitest';

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => '';
}

vi.mock('react-media-recorder', () => ({
  useReactMediaRecorder: () => ({
    status: 'idle',
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    mediaBlobUrl: '',
  }),
}));
