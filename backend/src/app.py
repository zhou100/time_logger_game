from fastapi import FastAPI, HTTPException, Depends, Request, status, APIRouter
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
from dotenv import load_dotenv
from pydub import AudioSegment
from openai import OpenAI
import httpx
import traceback
import sys
import time
from functools import wraps
from logging_config import setup_logging, log_api_call, get_request_id
from paraphrase_logs import paraphrase_logger
from datetime import datetime, timedelta
import secrets

# Load environment variables
load_dotenv()

# Configure paths
current_dir = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(current_dir, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# Initialize FastAPI router
router = APIRouter()

# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React development server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up authentication
security = HTTPBasic()

# Set up rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure OpenAI client
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    http_client=httpx.Client()
)

if not client.api_key or client.api_key == "your_openai_api_key":
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="OpenAI API key not found. Please set OPENAI_API_KEY in .env file"
    )

# Authentication helper
def verify_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    is_username_correct = secrets.compare_digest(
        credentials.username.encode("utf8"),
        os.getenv("API_USERNAME", "").encode("utf8")
    )
    is_password_correct = secrets.compare_digest(
        credentials.password.encode("utf8"),
        os.getenv("API_PASSWORD", "").encode("utf8")
    )
    if not (is_username_correct and is_password_correct):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@app.get("/")
async def index(username: str = Depends(verify_credentials)):
    return {
        "message": "Welcome to Voice Note Taker API",
        "endpoints": {
            "/": "API documentation",
            "/api/v1/transcribe": "POST - Upload audio file for transcription (returns text/plain)",
            "/api/v1/paraphrase": "POST - Paraphrase text (returns text/plain)",
            "/api/v1/paraphrase_logs": "GET - View paraphrase logs (returns text/plain or JSON)",
            "/api/v1/paraphrase_logs/summary": "GET - View paraphrase logs summary (returns JSON)",
            "/api/v1/transcribe_with_time": "POST - Upload audio file for transcription with timestamp (returns text/plain)"
        }
    }

@router.post("/api/v1/transcribe")
@limiter.limit("10/minute")
async def transcribe(request: Request, username: str = Depends(verify_credentials)):
    if not client.api_key or client.api_key == "your_openai_api_key":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OpenAI API key not configured"
        )

    try:
        # Get the audio file from the request
        form = await request.form()
        audio_file = form["audio"]
        
        # Save to temporary file
        temp_path = os.path.join(TEMP_DIR, f"temp_{int(time.time())}.webm")
        with open(temp_path, "wb") as f:
            content = await audio_file.read()
            f.write(content)
        
        try:
            # Convert to mp3 (required by Whisper API)
            audio = AudioSegment.from_file(temp_path)
            audio.export(temp_path + ".mp3", format="mp3")
            
            # Transcribe using OpenAI's Whisper API
            with open(temp_path + ".mp3", "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )
            
            # Format with timestamp
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            formatted_response = f"{current_time}\n{transcript.text}"
            
            return PlainTextResponse(formatted_response)
            
        finally:
            # Clean up temporary files
            try:
                os.remove(temp_path)
                if os.path.exists(temp_path + ".mp3"):
                    os.remove(temp_path + ".mp3")
            except Exception as e:
                print(f"Error cleaning up temporary files: {str(e)}")
                
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing audio file: {str(e)}"
        )

@router.post("/api/v1/paraphrase")
@limiter.limit("30/minute")
async def get_paraphrase(request: Request, username: str = Depends(verify_credentials)):
    if not client.api_key or client.api_key == "your_openai_api_key":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OpenAI API key not configured"
        )

    try:
        data = await request.json()
        text = data.get("text", "")
        if not text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No text provided"
            )

        # Call OpenAI API for paraphrasing
        completion = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that paraphrases text while maintaining the original meaning."},
                {"role": "user", "content": f"Please paraphrase this text: {text}"}
            ]
        )
        
        paraphrased_text = completion.choices[0].message.content
        
        # Log the paraphrase
        paraphrase_logger.log_paraphrase(text, paraphrased_text)
        
        return PlainTextResponse(paraphrased_text)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error paraphrasing text: {str(e)}"
        )

@router.get("/api/v1/paraphrase_logs")
async def get_paraphrase_logs(
    request: Request,
    username: str = Depends(verify_credentials),
    start_time: str = None,
    end_time: str = None,
    limit: int = 100,
    format_type: str = "json"
):
    try:
        # Convert string timestamps to datetime if provided
        start_dt = datetime.fromisoformat(start_time) if start_time else None
        end_dt = datetime.fromisoformat(end_time) if end_time else None
        
        # Get logs
        logs = paraphrase_logger.get_logs(start_dt, end_dt, limit)
        
        if format_type == "text":
            text_output = []
            for log in logs:
                text_output.extend([
                    f"Timestamp: {log['timestamp']}",
                    "Original Text:",
                    log['original_text'],
                    "Paraphrased Text:",
                    log['paraphrased_text'],
                    "-" * 80
                ])
            return PlainTextResponse("\n".join(text_output))
        else:
            return logs
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving logs: {str(e)}"
        )

@router.get("/api/v1/paraphrase_logs/summary")
async def get_paraphrase_logs_summary(username: str = Depends(verify_credentials)):
    try:
        logs = paraphrase_logger.get_logs()
        total_count = len(logs)
        
        if total_count == 0:
            return {
                "total_count": 0,
                "average_original_length": 0,
                "average_paraphrased_length": 0,
                "oldest_entry": None,
                "newest_entry": None
            }
            
        avg_original = sum(len(log['original_text']) for log in logs) / total_count
        avg_paraphrased = sum(len(log['paraphrased_text']) for log in logs) / total_count
        
        timestamps = [datetime.fromisoformat(log['timestamp']) for log in logs]
        oldest = min(timestamps)
        newest = max(timestamps)
        
        return {
            "total_count": total_count,
            "average_original_length": round(avg_original, 2),
            "average_paraphrased_length": round(avg_paraphrased, 2),
            "oldest_entry": oldest.isoformat(),
            "newest_entry": newest.isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating summary: {str(e)}"
        )

@router.post("/api/v1/transcribe_with_time")
@limiter.limit("10/minute")
async def transcribe_with_time(request: Request, username: str = Depends(verify_credentials)):
    if not client.api_key or client.api_key == "your_openai_api_key":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OpenAI API key not configured"
        )

    try:
        # Get the audio file from the request
        form = await request.form()
        audio_file = form["audio"]
        
        # Save to temporary file
        temp_path = os.path.join(TEMP_DIR, f"temp_{int(time.time())}.webm")
        with open(temp_path, "wb") as f:
            content = await audio_file.read()
            f.write(content)
        
        try:
            # Convert to mp3 (required by Whisper API)
            audio = AudioSegment.from_file(temp_path)
            audio.export(temp_path + ".mp3", format="mp3")
            
            # Transcribe using OpenAI's Whisper API
            with open(temp_path + ".mp3", "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )
            
            # Format with timestamp
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            formatted_response = f"{current_time}\n{transcript.text}"
            
            return PlainTextResponse(formatted_response)
            
        finally:
            # Clean up temporary files
            try:
                os.remove(temp_path)
                if os.path.exists(temp_path + ".mp3"):
                    os.remove(temp_path + ".mp3")
            except Exception as e:
                print(f"Error cleaning up temporary files: {str(e)}")
                
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing audio file: {str(e)}"
        )

app.include_router(router)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
