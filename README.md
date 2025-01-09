# Time Logger Game

A FastAPI-based backend API for tracking time spent on different activities using voice commands. Users can start and end tasks using voice messages, which are automatically transcribed and classified into categories.

## Features

- Voice command processing for starting and ending tasks
- Automatic task classification into categories (study, workout, family time, etc.)
- Time tracking with automatic session ending after 4 hours
- Daily summaries of time spent in each category
- User authentication and personal data management
- RESTful API endpoints for data access

## Technical Stack

- FastAPI for the backend API
- PostgreSQL for data storage
- SQLAlchemy for ORM
- Alembic for database migrations
- OpenAI Whisper for audio transcription
- JWT for authentication

## Setup

1. Create a Python virtual environment:
```bash
python -m venv py310
source py310/bin/activate  # On Windows: py310\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables in `.env`:
```env
# Database settings
DATABASE_URL=postgresql://user:password@localhost/timelogger

# JWT settings
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30

# OpenAI settings
OPENAI_API_KEY=your-openai-api-key
```

4. Initialize the database:
```bash
alembic upgrade head
```

5. Start the server:
```bash
uvicorn app.main:app --reload
```

## API Endpoints

### Authentication
- POST `/api/v1/users/` - Create new user
- POST `/api/v1/users/token` - Login and get access token

### Tasks
- POST `/api/v1/tasks/start` - Start a new task
- POST `/api/v1/tasks/end/{task_id}` - End a specific task
- GET `/api/v1/tasks/summary/daily` - Get daily task summary

### Audio Processing
- POST `/api/v1/audio/process` - Process voice command

## Usage Example

1. Start a task with voice command:
```bash
curl -X POST "http://localhost:8000/api/v1/audio/process" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "audio=@start_studying.mp3"
```

2. End a task with voice command:
```bash
curl -X POST "http://localhost:8000/api/v1/audio/process" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "audio=@done_studying.mp3"
```

3. Get daily summary:
```bash
curl "http://localhost:8000/api/v1/tasks/summary/daily" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Development

### Database Migrations

To create a new migration:
```bash
alembic revision --autogenerate -m "description"
```

To apply migrations:
```bash
alembic upgrade head
```

To revert migrations:
```bash
alembic downgrade -1
```

## License

[MIT License](LICENSE)