# Scratchpad

## Current Task
Implementing Voice Transcription API with Database Integration

### Progress
[X] Created database models for chat history and categorized entries
[X] Added Pydantic schemas for request/response handling
[X] Created categorization service using GPT-3.5-turbo
[X] Updated audio processing endpoint to save transcriptions
[X] Successfully applied database migrations

### Database Schema
1. Chat History Table
   - id (PK)
   - user_id (FK to users)
   - audio_path
   - transcribed_text
   - created_at

2. Categorized Entries Table
   - id (PK)
   - chat_history_id (FK to chat_history)
   - category (ENUM: TODO, IDEA, THOUGHT, TIME_RECORD)
   - extracted_content
   - created_at

### Next Steps
[ ] Test audio transcription with database integration
[ ] Add endpoints for retrieving categorized entries
[ ] Implement error handling for database operations
[ ] Add unit tests for database operations

## Lessons Learned
1. When using Flask's `render_template`, make sure to put HTML files in the `templates` directory
2. When serving an API, it's better to use `jsonify` for consistent JSON responses
3. Base64 encoded credentials for HTTP Basic Auth: `dm9pY2Vub3RlX2FwaTpWTlRfc2VjdXJlXzIwMjUh`
4. Important to handle CORS if the API will be accessed from web browsers
5. Keep API credentials in environment variables for security
6. When using SQLAlchemy enums with Alembic:
   - Use `postgresql.ENUM` for PostgreSQL enum types
   - Set `create_type=False` and use `checkfirst=True` to handle existing types
   - Be careful with enum type changes in migrations

## Testing Plan
### Testing Plan
1. Audio Processing Flow Test
   - Record test audio files with different types of content
   - Test transcription accuracy with Whisper API
   - Verify transcribed text is saved to chat_history table
   - Check categorization accuracy with GPT-3.5-turbo
   - Verify categorized entries are saved correctly

2. API Endpoint Tests
   - Test /api/process endpoint with audio file upload
   - Test /api/categories/{category} for retrieving specific categories
   - Test /api/categories for retrieving all entries
   - Verify proper error handling for invalid requests
   - Test authentication and authorization

3. Database Integration Tests
   - Test relationships between User, ChatHistory, and CategorizedEntry
   - Verify cascade deletes work correctly
   - Test concurrent access patterns
   - Verify indexes are working efficiently

4. Error Handling Tests
   - Test with invalid audio files
   - Test with missing API keys
   - Test with network failures
   - Test with database connection issues
   - Test with invalid categories

## System Overview: Time Logger Game

## Core Technologies

The Time Logger Game utilizes a robust stack of modern technologies:

- FastAPI web framework for efficient API development
- PostgreSQL database for reliable data storage
- SQLAlchemy ORM with Alembic for database management and migrations
- OpenAI APIs:
  * Whisper API for accurate audio transcription
  * GPT-4o-mini for advanced text processing and categorization

## System Architecture

The architecture is designed with clear separation of concerns:

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

### API Layer

#### Audio Processing
- POST `/audio/process`
  * Accepts audio file upload
  * Returns transcribed and categorized content

#### Content Management
- GET `/categories/{category}`
  * Retrieves content by category
  * Supports filtering and pagination

#### Time Tracking
- POST `/tasks/start`
  * Starts a new task
  * Categorizes based on description
- POST `/tasks/end/{task_id}`
  * Ends a task
  * Calculates duration

#### User Management
- POST `/users`
  * Creates new user
- GET `/users/me`
  * Retrieves current user info

### Processing Flow
1. Audio Upload & Authentication
   - Validate file format
   - Check user credentials
   - Store temporary audio file

2. Transcription (Whisper API)
   - Convert audio to required format
   - Send to Whisper API
   - Store transcribed text

3. Content Processing (GPT-4o-mini)
   - Analyze text content
   - Identify categories
   - Extract structured information

4. Data Storage
   - Save to chat_history
   - Create categorized entries
   - Update task records if needed

## Current Status

✅ Completed:
- Basic infrastructure and database setup
- User authentication system
- Audio processing pipeline
- Database schema and migrations

🚧 In Progress:
- Content categorization logic
- Retrieval endpoints
- Error handling improvements

## Next Steps

1. [ ] Complete categorization system:
   - Implement category detection logic
   - Add validation rules
   - Handle edge cases

2. [ ] Add content retrieval features:
   - Implement filtering
   - Add sorting options
   - Support pagination

3. [ ] Enhance error handling:
   - Add detailed error messages
   - Implement retry logic
   - Add logging

## Technical Notes

### Best Practices
1. Security:
   - Store credentials in environment variables
   - Use proper authentication headers
   - Implement rate limiting

2. File Handling:
   - Use temporary files for audio
   - Clean up in try/finally blocks
   - Validate file formats

3. Database:
   - Use migrations for schema changes
   - Implement proper relationships
   - Handle enum types carefully

### Model Usage
- Audio Transcription: `whisper-1`
- Text Processing: `gpt-4o-mini`
- Keep models consistent across services
