# Time Logger Game

A FastAPI and React-based voice-enabled time tracking and content organization system. Upload audio notes and let the system automatically categorize and organize your content while tracking your time.

## Features

- Voice-based time tracking and note-taking
- Automatic content categorization (TODOs, Ideas, Thoughts, Time Records)
- User authentication and multi-user support
- RESTful API with OpenAPI documentation
- Structured data storage with PostgreSQL
- Modern, responsive React-based UI
- Real-time audio recording and processing
- Material-UI components for consistent design
- Mobile-first approach for use on any device

## Product Vision

### Target Users
- Students tracking study sessions and capturing lecture notes
- Professionals managing work time and capturing meeting insights
- Creative workers organizing ideas and tracking project time
- Personal development enthusiasts monitoring growth activities
- Anyone wanting an effortless way to track time and organize thoughts

### Key Benefits
- Natural Interface: Voice-based input removes friction from time tracking and note-taking
- AI-Powered Organization: Automatic categorization saves time and maintains structure
- Comprehensive Tracking: Combine time data with contextual notes for better insights
- Flexible Use: Works for both structured (time tracking) and unstructured (ideas, thoughts) content
- Cross-Platform: Access your data from any device through the web interface

## Core Technologies

### Backend
- FastAPI web framework for efficient API development
- PostgreSQL database for reliable data storage
- SQLAlchemy ORM with Alembic for database management and migrations
- OpenAI APIs:
  * Whisper API for accurate audio transcription
  * GPT-4o-mini for advanced text processing and categorization

### Frontend
- React for building interactive user interfaces
- Material-UI for consistent, modern design components
- React Router for client-side routing
- Redux for state management
- Web Audio API for voice recording
- Responsive design for mobile and desktop use

## System Architecture

```mermaid
graph TD
    %% Frontend Section
    subgraph Frontend[Browser/Mobile Client]
        UI[User Interface]
        subgraph ReactComponents[React Components]
            App[App Component]
            Nav[Navigation]
            Auth[Auth Provider]
            
            subgraph CoreFeatures[Core Features]
                TR[Time Tracker]
                AR[Audio Recorder]
                CV[Content Viewer]
                PF[Profile Manager]
            end
            
            subgraph Analytics[Analytics & Insights]
                TD[Time Dashboard]
                VZ[Visualizations]
                IG[Insight Generator]
            end
            
            App --> Nav
            App --> Auth
            Auth --> CoreFeatures
            Auth --> Analytics
            Nav --> CoreFeatures
        end
        
        subgraph StateManagement[State Management]
            RS[(Redux Store)]
            subgraph Slices
                AS[Auth Slice]
                TS[Timer Slice]
                CS[Content Slice]
                US[User Slice]
                ES[Entry Slice]
            end
            RS --> Slices
        end
        
        subgraph Services
            APIS[API Service]
            WA[Web Audio API]
            ST[Storage Service]
            SW[Service Worker]
        end
        
        CoreFeatures --> RS
        Analytics --> RS
        RS --> CoreFeatures
        AR --> WA
        CoreFeatures --> APIS
        CoreFeatures --> ST
        SW -->|Offline Support| ST
    end

    %% Backend Flow
    subgraph Backend[Server]
        B[FastAPI Web Server]
        C{Authentication}
        
        subgraph Processing[Content Processing]
            D[Audio Processing]
            F[OpenAI Whisper API]
            G[Transcribed Text]
            H[GPT-4o-mini API]
            
            subgraph AIFeatures[AI Analysis]
                I[Content Categorization]
                SEN[Sentiment Analysis]
                SUM[Summary Generation]
                ACT[Action Items Extraction]
                CAL[Calendar Suggestions]
            end
        end
        
        B -->|Authenticates| C
        C -->|Success| Processing
        C -->|Failure| E[Return Error]
        D -->|Sends to| F
        F -->|Returns| G
        G -->|Processes with| H
        H --> AIFeatures
    end

    %% Database Section
    subgraph Database
        J[(PostgreSQL Database)]
        
        subgraph CoreTables[Core Tables]
            L[Users]
            M[ChatHistory]
            N[CategorizedEntries]
            O[Tasks]
        end
        
        J -->|Contains| CoreTables
    end

    %% API Endpoints
    subgraph APIEndpoints[API Endpoints]
        subgraph CoreAPI[Core APIs]
            P["/audio/process"]
            Q["/categories/category"]
            R["/tasks/action"]
            S["/users"]
        end
        
        subgraph AnalyticsAPI[Analytics APIs]
            AA["/insights"]
            AT["/trends"]
            AS["/summaries"]
        end
    end

    %% Cross-component Connections
    APIS -->|Calls| B
    AIFeatures -->|Stores in| J
    J -->|Retrieves via| APIEndpoints
    APIEndpoints -->|Serves| APIS
    SW -->|Syncs when online| B

    %% Styling
    classDef frontendStyle fill:#e1f5fe,stroke:#333,stroke-width:2px
    classDef backendStyle fill:#e8f5e9,stroke:#333,stroke-width:2px
    classDef dbStyle fill:#fff3e0,stroke:#333,stroke-width:2px
    classDef apiStyle fill:#f3e5f5,stroke:#333,stroke-width:2px
    class Frontend frontendStyle
    class Backend,Processing backendStyle
    class Database,CoreTables dbStyle
    class APIEndpoints,CoreAPI,AnalyticsAPI apiStyle
```

### Data Layer

Database Schema:
```sql
Users:
  - id (PK)
  - email (unique)
  - hashed_password (nullable)
  - is_active
  - auth_provider ("email" | "google" | "supabase")
  - supabase_id (unique, nullable)

Entries:
  - id (UUID, PK)
  - user_id (FK -> Users)
  - audio_key (S3/R2 object key)
  - transcript (text, nullable)
  - duration_seconds (nullable)
  - recorded_at (nullable)
  - created_at

EntryClassifications:
  - id (PK)
  - entry_id (FK -> Entries)
  - text (extracted content)
  - category (ENUM: EARNING, LEARNING, RELAXING, FAMILY)
  - estimated_minutes (nullable)

Jobs:
  - id (UUID, PK)
  - entry_id (FK -> Entries)
  - status (ENUM: pending, processing, done, failed)
  - step (current processing step)
  - error (nullable)

AuditResults:
  - id (PK)
  - user_id (FK -> Users)
  - audit_date
  - audit_type ("daily" | "weekly")
  - entries_count
  - breakdown_json
  - audit_text
  - generated_at

Notifications:
  - id (PK)
  - user_id (FK -> Users)
  - event_type
  - payload_json
  - created_at
```

## Installation (Local Development & Testing)

Follow these steps to set up both the FastAPI backend and the React frontend for local development and testing.

### 1. Clone the Repository
```bash
git clone https://github.com/zhou100/time_logger_game.git
cd time_logger_game
```

### 2. Backend Setup

#### Create and Activate a Python Virtual Environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

#### Install Backend Dependencies
```bash
pip install -r requirements.txt
```

#### Set Up Environment Variables
1. Create a new `.env` file in the project root:
```bash
cp .env.example .env
```

2. Edit `.env` with your configuration:
```
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
OPENAI_API_KEY=your_openai_api_key
SECRET_KEY=your_secret_key
```

#### Initialize the Database
```bash
cd backend
alembic upgrade head
```

### 3. Frontend Setup

#### Install Frontend Dependencies
```bash
cd frontend
npm install  # or yarn install
```

### 4. Running the Application

#### Start the Backend Server
From the project root directory:
```bash
cd backend
uvicorn app.main:app --reload
```
The FastAPI server will be available at http://localhost:8000

#### Start the Frontend Development Server
In a new terminal, from the project root:
```bash
cd frontend
npm start  # or yarn start
```
The React application will be available at http://localhost:3000

### 5. Accessing the Application

- Web Interface: http://localhost:3000
- API Documentation: http://localhost:8000/docs
- API Redoc: http://localhost:8000/redoc

## Docker Setup for Local Development

### Prerequisites
- Docker
- Docker Compose

### Getting Started with Docker

1. Clone the repository:
```bash
git clone https://github.com/yourusername/time_logger_game.git
cd time_logger_game
```

2. Start the development environment:
```bash
docker compose up --build
```

This will:
- Build and start the backend service on port 10000
- Build and start the frontend service on port 3000
- Set up hot-reloading for both services

3. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:10000
- API Documentation: http://localhost:10000/docs

### Development with Docker

- The Docker setup includes volume mounts, so your code changes will automatically trigger rebuilds
- Backend files are mounted at `/app` in the backend container
- Frontend files are mounted at `/app` in the frontend container
- Both services support hot-reloading for a smooth development experience

### Useful Docker Commands

```bash
# Start services in detached mode
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Rebuild specific service
docker compose build backend  # or frontend

# Restart specific service
docker compose restart backend  # or frontend
```

### Troubleshooting

1. If the frontend can't connect to the backend:
   - Ensure both services are running (`docker compose ps`)
   - Check if the `REACT_APP_API_URL` environment variable is set correctly
   - Verify network connectivity between containers

2. For permission issues:
   - Ensure the `temp` directory has correct permissions
   - Run `docker compose down` and rebuild with `docker compose up --build`

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

## Future Improvements

### Technical Enhancements
- Mobile application development (iOS/Android)
- Offline support with local-first architecture
- Real-time collaboration features
- Calendar integration (Google Calendar, iCal)
- Enhanced analytics and reporting
- API integrations with popular productivity tools

### Product Features
- Custom categories and workflows
- Advanced visualization of time patterns
- AI-powered productivity insights
- Team and organization support

### Infrastructure
- Multi-region deployment
- Enhanced security features
- Automated backup systems
- Performance optimization
- Scalability improvements

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.