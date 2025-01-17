# Time Logger Game

A FastAPI-based voice-enabled time tracking and content organization system. Upload audio notes and let the system automatically categorize and organize your content while tracking your time.

## Features

- Voice-based time tracking and note-taking
- Automatic content categorization (TODOs, Ideas, Thoughts, Time Records)
- User authentication and multi-user support
- RESTful API with OpenAPI documentation
- Structured data storage with PostgreSQL

## Core Technologies

- FastAPI web framework for efficient API development
- PostgreSQL database for reliable data storage
- SQLAlchemy ORM with Alembic for database management and migrations
- OpenAI APIs:
  * Whisper API for accurate audio transcription
  * GPT-4o-mini for advanced text processing and categorization

## System Architecture

### Data Layer

Database Schema:
```sql
Users:
  - id (PK)
  - email (unique)
  - username (unique)
  - hashed_password

ChatHistory:
  - id (PK)
  - user_id (FK -> Users)
  - audio_path
  - transcribed_text
  - created_at

CategorizedEntries:
  - id (PK)
  - chat_history_id (FK -> ChatHistory)
  - category (ENUM: TODO, IDEA, THOUGHT, TIME_RECORD)
  - extracted_content
  - created_at

Tasks:
  - id (PK)
  - user_id (FK -> Users)
  - category (ENUM: STUDY, WORKOUT, FAMILY_TIME, WORK, HOBBY, OTHER)
  - start_time
  - end_time
  - duration
  - description
```

### API Endpoints

#### Audio Processing
- POST `/audio/process` - Upload and process audio files
- Returns transcribed and categorized content

#### Content Management
- GET `/categories/{category}` - Retrieve content by category
- Supports filtering and pagination

#### Time Tracking
- POST `/tasks/start` - Start a new task
- POST `/tasks/end/{task_id}` - End a task

#### User Management
- POST `/users` - Create new user
- GET `/users/me` - Retrieve current user info

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/time_logger_game.git
cd time_logger_game
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Initialize the database:
```bash
alembic upgrade head
```

6. Run the application:
```bash
uvicorn app.main:app --reload
```

## Environment Variables

Create a `.env` file with the following variables:
```
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
OPENAI_API_KEY=your_openai_api_key
SECRET_KEY=your_secret_key
```

## Usage

1. Start the server:
```bash
uvicorn app.main:app --reload
```

2. Access the API documentation:
```
http://localhost:8000/docs
```

3. Create a user account and obtain authentication credentials

4. Use the API endpoints to:
   - Upload audio files
   - Track time
   - Retrieve categorized content

## Development

### Running Tests
```bash
pytest
```

### Database Migrations
```bash
# Create a new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head
```

## Best Practices

### Security
- Store credentials in environment variables
- Use proper authentication headers
- Implement rate limiting

### File Handling
- Use temporary files for audio
- Clean up in try/finally blocks
- Validate file formats

### Database
- Use migrations for schema changes
- Implement proper relationships
- Handle enum types carefully

## Model Usage
- Audio Transcription: `whisper-1`
- Text Processing: `gpt-4o-mini`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.