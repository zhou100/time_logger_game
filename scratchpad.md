# Scratchpad

## Current Task
Deploy voice transcription and paraphrasing service

### Requirements
- Endpoints:
  - POST /api/v1/transcribe (for audio file upload)
  - GET /api/v1/paraphrase (for viewing results)
- Authentication system to restrict access
- iOS Shortcuts integration instructions

### Plan
[X] Set up Flask application with required endpoints
[X] Add authentication middleware
[X] Configure Gunicorn/uWSGI
[X] Set up Nginx as reverse proxy
[X] Add error handling and logging
[X] Create deployment workflow
[X] Update deployment documentation
[X] Add iOS Shortcuts integration guide

### Deployment Options (Cheapest to Most Expensive)
1. Render (Free tier available)
   - Web Services start at $7/month
   - Good for small apps
   - Easy deployment

2. Fly.io (Good free tier)
   - Free tier with 3 shared-cpu VMs
   - Starts at $1.94/month for paid
   - Good documentationmak

3. PythonAnywhere ($5/month)
   - Python-specific hosting
   - Easy to use
   - Good for beginners

### Deployment Instructions
1. Choose hosting platform
2. Prepare for deployment:
   - Set up environment variables
   - Configure logging for production
   - Add proper CORS headers
   - Set up monitoring

### iOS Integration Notes
- Use Base64 encoded credentials in Authorization header
- Format: `Basic <base64(username:password)>`
- Headers must be added to each "Get Contents of URL" action
- Form data required for audio file upload

## Progress

[X] Converted web app to API-only service
[X] Implemented HTTP Basic Authentication
[X] Added root endpoint with API documentation
[X] Tested transcribe and paraphrase endpoints
[X] Updated README.md with comprehensive API documentation
[X] Added iOS Shortcuts integration instructions

## Lessons Learned

1. When using Flask's `render_template`, make sure to put HTML files in the `templates` directory
2. When serving an API, it's better to use `jsonify` for consistent JSON responses
3. Base64 encoded credentials for HTTP Basic Auth: `dm9pY2Vub3RlX2FwaTpWTlRfc2VjdXJlXzIwMjUh`
4. Important to handle CORS if the API will be accessed from web browsers
5. Keep API credentials in environment variables for security

## Task Progress

## Current Task: Implementing Real Audio Transcription

## Task Description
Setting up real audio transcription with OpenAI's Whisper API for the time tracking application.

## Current Status
✅ Successfully implemented and tested real audio transcription:
1. OpenAI API key is properly configured and working
2. Audio transcription is accurate and reliable
3. Task categorization is working correctly
4. Both task start and end commands are processed properly

## Test Results
1. Start Task Test:
   - Input: "I want to start working on my physics homework. This is for my quantum mechanics class."
   - Result: Successfully created task
   - Category: study
   - Description: "working on physics homework for quantum mechanics class"

2. End Task Test:
   - Input: "I'm done with my physics homework for now."
   - Result: Successfully ended task
   - Duration calculated correctly

## Technical Implementation
- Using OpenAI Whisper API through openai package v0.28
- Text-to-speech testing using pyttsx3
- Proper environment variable configuration
- Robust error handling and fallbacks

## Next Steps
[X] Verify environment variable configuration
[X] Implement proper error handling and fallbacks
[X] Confirm OpenAI API key presence in .env
[X] Test with real audio transcription
[ ] Add error handling for API rate limits
[ ] Consider implementing batch processing for longer audio files
[ ] Add support for more task categories

## Lessons
1. Audio Processing:
   - Use 16kHz sample rate for optimal Whisper API compatibility
   - Keep audio files under 25MB for best performance
   - Clean up temporary files after processing

2. Environment Configuration:
   - Keep sensitive keys in .env file
   - Use python-dotenv for configuration
   - Implement fallbacks for development

3. Testing Strategy:
   - Use text-to-speech for consistent test audio
   - Test both start and end scenarios
   - Verify task metadata and duration calculations

## Future Improvements
1. Add support for longer audio files
2. Implement batch processing for multiple files
3. Add more sophisticated task categorization
4. Improve error handling and user feedback
5. Add support for task modification through voice commands

## Current Task: Deployment Planning

## Progress
[X] Implement paraphrase endpoint using gpt-3.5-turbo
[X] Test end-to-end flow:
  - Audio upload → Transcription → Paraphrasing
[X] Add proper error handling and logging for both endpoints

## Next Steps
[ ] Choose hosting platform
[ ] Prepare for deployment:
    - [ ] Set up environment variables
    - [ ] Configure logging for production
    - [ ] Add proper CORS headers
    - [ ] Set up monitoring
[ ] Add support for longer audio files
[ ] Set up proper rate limiting with Redis
[ ] Add caching for frequently requested paraphrases

## Lessons
1. When using Flask's current_app, make sure to import it from flask: `from flask import current_app`
2. Handle both tuple responses (response, status_code) and direct response objects in decorators
3. Use request IDs consistently in log messages for better traceability
4. Log API call completion with duration and status code for monitoring
5. Use appropriate log levels (INFO for success, ERROR for failures)
6. Always check OpenAI API key configuration before making API calls
7. Use gpt-3.5-turbo for faster and more cost-effective processing
8. Keep system prompts clear and focused for better results

## Current Task: Implementing Paraphrase Logging System

### Requirements
- Store logs of paraphrased results for later review and summarization
- Include timestamp, original text, and paraphrased result
- Make logs easily accessible for future analysis

### Plan
[X] Determine appropriate log storage format and location
    - Created paraphrase_logs.py with ParaphraseLogger class
    - Using JSONL format for efficient storage and retrieval
    - Logs stored in logs/paraphrase_logs.jsonl
[X] Implement logging mechanism in the paraphrase endpoint
    - Added paraphrase logging to app.py
    - Each log entry includes timestamp, request_id, original text, and paraphrased text
[X] Add functionality to retrieve and review logs
    - Added /api/v1/paraphrase_logs endpoint with filtering options
    - Added /api/v1/paraphrase_logs/summary endpoint for statistics
[X] Consider adding summarization capabilities
    - Implemented summary endpoint with statistics over time periods

### Current Time Reference
- Latest timestamp: 2025-01-08T13:26:22-08:00

### Implementation Details
1. Log Format (JSONL):
```json
{
    "timestamp": "2025-01-08T13:26:22-08:00",
    "request_id": "20250108132622-abcd1234",
    "original_text": "original text",
    "paraphrased_text": "paraphrased version"
}
```

2. Storage Location:
   - All logs stored in `logs/paraphrase_logs.jsonl`
   - Using JSONL format for easy appending and reading
   - Each line is a complete JSON object

3. Features:
   - Automatic log rotation and backup
   - Time-based filtering
   - Limit on number of logs returned
   - UTF-8 encoding support

### How to Access Logs
1. View Raw Logs:
   ```
   GET /api/v1/paraphrase_logs?format=json
   ```
   Optional parameters:
   - start_time: ISO format (YYYY-MM-DDTHH:MM:SS)
   - end_time: ISO format (YYYY-MM-DDTHH:MM:SS)
   - limit: Maximum number of logs (default: 100)
   - format: 'json' or 'text' (default: 'json')

2. View Summary:
   ```
   GET /api/v1/paraphrase_logs/summary?days=7
   ```
   Optional parameters:
   - days: Number of days to summarize (default: 7)

### Example Usage
1. View last 50 logs in text format:
   ```
   GET /api/v1/paraphrase_logs?limit=50&format=text
   ```

2. View logs for a specific date range:
   ```
   GET /api/v1/paraphrase_logs?start_time=2025-01-01T00:00:00&end_time=2025-01-07T23:59:59
   ```

3. Get summary for last 30 days:
   ```
   GET /api/v1/paraphrase_logs/summary?days=30
   ```

### Next Steps
1. Consider adding export functionality (CSV, Excel)
2. Add log cleanup/archival mechanism
3. Consider adding more detailed analytics

## Progress

## Current Task: Add Time-Based Logging Endpoint

### Requirements
- Create a new endpoint for time-based logging
- Log format should be simple: date followed by transcribed audio
- No paragraph formatting needed
- Current time reference: 2025-01-08T13:53:24-08:00

### Plan
[X] Add new endpoint `/api/v1/transcribe_with_time`
[X] Implement time-based logging functionality
[X] Update API documentation in root endpoint
[X] Test the new endpoint

## Progress
- Added new endpoint `/api/v1/transcribe_with_time` that includes timestamp with transcription
- Updated API documentation in both root endpoint and 404 handler
- Maintained consistent error handling and logging patterns
- Added proper cleanup of temporary files

## Lessons
- When adding new endpoints, remember to update documentation in both root endpoint and 404 handler
- Keep consistent error handling and logging patterns across similar endpoints
- Clean up temporary files in a finally block to ensure cleanup happens even if an error occurs

## Current Task: Setting Up Time Logger Game API

## Task Description
Setting up a FastAPI-based backend API for time tracking with voice commands, including:
- PostgreSQL database setup
- User authentication
- Task management
- Audio processing

## Progress
[X] Set up PostgreSQL database
[X] Configure environment variables
[X] Create database models and migrations
[X] Set up FastAPI application structure
[X] Implement user authentication
[X] Implement task management endpoints
[X] Set up audio processing service
[X] Test basic functionality

## Current Status
Working on audio processing endpoint testing. We've encountered and fixed several issues:
1. Fixed file handling in audio processing
2. Added mock responses for development without OpenAI API key
3. Fixed OpenAI package version compatibility

## Next Steps
[ ] Complete audio processing testing
[ ] Add error handling for edge cases
[ ] Add input validation
[ ] Add more comprehensive API documentation

## Lessons
1. Database:
   - PostgreSQL 17 is installed
   - Database URL format: `postgresql://user:password@localhost:5432/dbname`
   - Use pgAdmin for database management

2. Dependencies:
   - OpenAI package version 0.28 is required for Whisper API compatibility
   - Need email-validator package for FastAPI email validation
   - Using SQLAlchemy for ORM and Alembic for migrations

3. Authentication:
   - Using JWT with 30-minute token expiration
   - Store tokens securely in environment variables

4. Error Handling:
   - Always clean up temporary files in try/finally blocks
   - Add proper error messages for missing API keys
   - Handle file access errors gracefully

5. Development Practices:
   - Use mock responses when external services (like OpenAI) are not available
   - Keep track of package versions in requirements.txt
   - Use proper type hints and validation

## Project Status: Audio Processing Implementation Complete

## Major Milestones Achieved
✅ Real audio transcription with OpenAI Whisper API
✅ Task start/end voice commands
✅ Proper environment configuration
✅ Test utilities created

## Next Phase Planning
See detailed plan in `progress_reports/2025_01_09.md`

## Current Task Status
All planned tasks for audio processing implementation are complete. Ready to move on to enhancements and optimizations as outlined in the progress report.

## Lessons Learned
1. Audio Processing:
   - Use 16kHz sample rate for Whisper API
   - Keep audio files under 25MB
   - Clean up temp files properly

2. Environment Configuration:
   - Keep sensitive keys in .env
   - Use python-dotenv
   - Implement development fallbacks

3. Testing Strategy:
   - Use text-to-speech for consistent tests
   - Test both start and end scenarios
   - Verify all metadata

## Reference Information
- OpenAI package version: 0.28
- Python environment: py310
- Key files:
  - app/services/audio.py: Audio processing
  - app/config.py: Environment configuration
  - create_test_audio.py: Test utilities

## Project Status: Preparing for Production Deployment

## Current Focus
Preparing the API for production deployment with focus on:
1. Security
2. Reliability
3. Monitoring
4. Documentation

## Next Steps Priority
1. [ ] Production Environment Setup
   - CORS, SSL/TLS, DB pooling
   - Environment configuration
   
2. [ ] API Hardening
   - Request limits
   - Rate limiting
   - Input validation
   
3. [ ] Documentation & Examples
   - API documentation
   - Deployment guide
   - Client examples

## Key Files to Create/Update
- `nginx.conf`: Server configuration
- `deployment.md`: Deployment guide
- `docker-compose.yml`: Container orchestration
- `.env.production`: Production environment template

## Security Checklist
- [ ] SSL/TLS configuration
- [ ] Rate limiting
- [ ] Request validation
- [ ] Secure headers
- [ ] CORS policy
- [ ] Database security

## Reference Information
- FastAPI production deployment docs
- nginx configuration best practices
- PostgreSQL production settings
- OpenAI API production guidelines

## Previous Accomplishments
✅ Real audio transcription working
✅ Task management system functional
✅ Environment configuration secure
✅ Test utilities created

## Lessons Learned
1. Security:
   - Keep sensitive keys in .env
   - Use proper validation
   - Implement rate limiting

2. API Design:
   - Clear error messages
   - Proper status codes
   - Input validation

3. Testing:
   - Use test utilities
   - Verify all endpoints
   - Check error cases
