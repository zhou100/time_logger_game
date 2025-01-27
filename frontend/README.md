# Time Logger Game Frontend

This is the React-based frontend for the Time Logger Game application. It provides a modern, responsive interface for voice-based time tracking and content organization.

## Features

- Real-time audio recording and processing
- Material-UI based responsive design
- Interactive time tracking interface
- Voice note management
- Content categorization view
- User authentication
- Profile management

## Tech Stack

- React 18
- Material-UI
- Redux for state management
- React Router for navigation
- Web Audio API for voice recording
- Axios for API communication

## Getting Started

### Prerequisites

- Node.js 16+
- npm 8+
- Backend API running (see main README)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start development server:
```bash
npm start
```

The app will be available at http://localhost:3000

### Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

## Development

### Project Structure

```
src/
  ├── components/     # Reusable UI components
  ├── pages/         # Page components
  ├── services/      # API and utility services
  ├── store/         # Redux store and slices
  ├── hooks/         # Custom React hooks
  ├── theme/         # Material-UI theme customization
  └── utils/         # Helper functions
```

### Key Components

- `AudioRecorder`: Handles voice recording functionality
- `TimeTracker`: Manages time tracking interface
- `ContentView`: Displays categorized content
- `AuthProvider`: Manages authentication state
- `Navigation`: Handles routing and menu structure

## Testing

```bash
# Run unit tests
npm test

# Run e2e tests
npm run test:e2e
```

## Contributing

See the main project README for contribution guidelines.
