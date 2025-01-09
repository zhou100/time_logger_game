from flask import Flask, request, jsonify, g, current_app
from flask_httpauth import HTTPBasicAuth
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import generate_password_hash, check_password_hash
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

# Load environment variables
load_dotenv()

# Configure paths
current_dir = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(current_dir, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

app = Flask(__name__)
auth = HTTPBasicAuth()

# Set up logging
setup_logging(app)

# Configure OpenAI client
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    http_client=httpx.Client()
)

if not client.api_key or client.api_key == "your_openai_api_key":
    app.logger.error("OpenAI API key not found. Please set OPENAI_API_KEY in .env file")

# Configure rate limiter
def get_auth_username():
    auth_username = auth.get_auth()
    return auth_username if auth_username else get_remote_address()

limiter = Limiter(
    key_func=get_auth_username,  # Rate limit by authenticated username or IP
    app=app,
    default_limits=["200 per day", "50 per hour"],  # Global limits
)

# Decorator to monitor API calls
def monitor_api_call(endpoint_name):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            g.request_id = get_request_id()
            app.logger.info(f"[{g.request_id}] Starting {endpoint_name} request")
            start_time = time.time()
            
            try:
                response = f(*args, **kwargs)
                duration = time.time() - start_time
                
                # Log the API call completion
                status_code = response[1] if isinstance(response, tuple) else 200
                app.logger.info(
                    f"[{g.request_id}] Completed {endpoint_name} request. "
                    f"Duration: {duration:.2f}s, Status: {status_code}"
                )
                return response
            
            except Exception as e:
                duration = time.time() - start_time
                app.logger.error(
                    f"[{g.request_id}] Error in {endpoint_name} request. "
                    f"Duration: {duration:.2f}s\n{traceback.format_exc()}"
                )
                raise
            
        return decorated_function
    return decorator

@auth.verify_password
def verify_password(username, password):
    if username == os.getenv("API_USERNAME") and password == os.getenv("API_PASSWORD"):
        return username
    return None

@app.route("/")
@auth.login_required
def index():
    return jsonify({
        "message": "Welcome to Voice Note Taker API",
        "endpoints": {
            "/": "API documentation",
            "/api/v1/transcribe": "POST - Upload audio file for transcription (returns text/plain)",
            "/api/v1/paraphrase": "POST - Paraphrase text (returns text/plain)",
            "/api/v1/paraphrase_logs": "GET - View paraphrase logs (returns text/plain or JSON)",
            "/api/v1/paraphrase_logs/summary": "GET - View paraphrase logs summary (returns JSON)",
            "/api/v1/transcribe_with_time": "POST - Upload audio file for transcription with timestamp (returns text/plain)"
        }
    })

@app.route("/api/v1/transcribe", methods=["POST"])
@auth.login_required
@limiter.limit("10 per minute")  # Stricter limit for resource-intensive endpoint
@monitor_api_call('transcribe')
def transcribe():
    if not client.api_key or client.api_key == "your_openai_api_key":
        app.logger.error(f"[{g.request_id}] OpenAI API key not configured")
        return jsonify({"error": "OpenAI API key not configured. Please set OPENAI_API_KEY in .env file"}), 500

    if "file" not in request.files:
        app.logger.error(f"[{g.request_id}] No file part in request")
        return jsonify({"error": "No file part"}), 400
    
    file = request.files["file"]
    if file.filename == "":
        app.logger.error(f"[{g.request_id}] No selected file")
        return jsonify({"error": "No selected file"}), 400

    try:
        # Generate a unique filename
        temp_path = os.path.join(TEMP_DIR, f"temp_{g.request_id}")
        
        # Save the uploaded file
        file.save(temp_path)
        app.logger.info(f"[{g.request_id}] File saved to {temp_path}")
        
        try:
            # Convert to mp3 (required by Whisper API)
            audio = AudioSegment.from_file(temp_path)
            audio.export(temp_path + ".mp3", format="mp3")
            app.logger.info(f"[{g.request_id}] File converted to MP3")
            
            # Transcribe using OpenAI's Whisper API
            with open(temp_path + ".mp3", "rb") as audio_file:
                app.logger.info(f"[{g.request_id}] Starting transcription with Whisper API")
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )
                
            app.logger.info(f"[{g.request_id}] Successfully transcribed audio")
            return transcript.text + "\n\n" + "Paraphrased version is below.", 200, {'Content-Type': 'text/plain'}
            
        finally:
            # Clean up temporary files
            try:
                os.remove(temp_path)
                os.remove(temp_path + ".mp3")
                app.logger.info(f"[{g.request_id}] Cleaned up temporary files")
            except Exception as e:
                app.logger.warning(f"[{g.request_id}] Error cleaning up files: {str(e)}")
    
    except Exception as e:
        app.logger.error(f"[{g.request_id}] Error processing audio: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Error processing audio file"}), 500

@app.route("/api/v1/paraphrase", methods=["POST"])
@auth.login_required
@limiter.limit("30 per minute")  # Less strict limit for text-based endpoint
@monitor_api_call('paraphrase')
def get_paraphrase():
    if not client.api_key or client.api_key == "your_openai_api_key":
        app.logger.error(f"[{g.request_id}] OpenAI API key not configured")
        return jsonify({"error": "OpenAI API key not configured"}), 500

    if not request.is_json:
        app.logger.error(f"[{g.request_id}] Request must be JSON")
        return jsonify({"error": "Request must be JSON"}), 400
    
    text = request.json.get("text")
    if not text:
        app.logger.error(f"[{g.request_id}] No text provided")
        return jsonify({"error": "No text provided"}), 400
    
    try:
        app.logger.info(f"[{g.request_id}] Processing paraphrase request")
        response = client.chat.completions.create(
            model="gpt-4o-mini",  
            messages=[
                {"role": "system", "content": "You are a helpful assistant that paraphrases text to make it more clear and concise while preserving the original meaning.keep the original language and do not translate."}, 
                {"role": "user", "content": f"Please paraphrase this text: {text}"}
            ]
        )
        
        app.logger.info(f"[{g.request_id}] Successfully received paraphrase response")
        paraphrased = response.choices[0].message.content.strip()
        
        # Log the paraphrase result
        paraphrase_logger.log_paraphrase(g.request_id, text, paraphrased)
        
        # Return plain text with Content-Type header
        return text + "\n\n" + paraphrased, 200, {'Content-Type': 'text/plain'}
    except Exception as e:
        app.logger.error(f"[{g.request_id}] Error paraphrasing text: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Error paraphrasing text"}), 500

@app.route("/api/v1/paraphrase_logs", methods=["GET"])
@auth.login_required
@limiter.limit("60 per minute")
@monitor_api_call('get_paraphrase_logs')
def get_paraphrase_logs():
    try:
        # Get query parameters
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        limit = request.args.get('limit', default=100, type=int)
        format_type = request.args.get('format', default='json')  # 'json' or 'text'

        # Convert string timestamps to datetime if provided
        start_dt = datetime.fromisoformat(start_time) if start_time else None
        end_dt = datetime.fromisoformat(end_time) if end_time else None

        # Get logs
        logs = paraphrase_logger.get_logs(start_dt, end_dt, limit)

        if format_type == 'text':
            # Format as plain text for easy reading
            text_output = []
            for log in logs:
                text_output.extend([
                    f"Timestamp: {log['timestamp']}",
                    f"Request ID: {log['request_id']}",
                    "Original Text:",
                    log['original_text'],
                    "Paraphrased Text:",
                    log['paraphrased_text'],
                    "-" * 80  # Separator
                ])
            return "\n".join(text_output), 200, {'Content-Type': 'text/plain'}
        else:
            # Return as JSON
            return jsonify({"logs": logs}), 200

    except ValueError as e:
        app.logger.error(f"[{g.request_id}] Invalid date format: {str(e)}")
        return jsonify({"error": "Invalid date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}), 400
    except Exception as e:
        app.logger.error(f"[{g.request_id}] Error retrieving logs: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Error retrieving logs"}), 500

@app.route("/api/v1/paraphrase_logs/summary", methods=["GET"])
@auth.login_required
@limiter.limit("30 per minute")
@monitor_api_call('get_paraphrase_logs_summary')
def get_paraphrase_logs_summary():
    try:
        # Get query parameters
        days = request.args.get('days', default=7, type=int)
        
        # Calculate start time
        start_dt = datetime.now() - timedelta(days=days)
        
        # Get logs
        logs = paraphrase_logger.get_logs(start_dt, None, limit=1000)
        
        # Generate summary
        summary = {
            "total_paraphrases": len(logs),
            "time_period": f"Last {days} days",
            "start_date": start_dt.isoformat(),
            "end_date": datetime.now().isoformat(),
            "average_original_length": sum(len(log['original_text']) for log in logs) / len(logs) if logs else 0,
            "average_paraphrased_length": sum(len(log['paraphrased_text']) for log in logs) / len(logs) if logs else 0,
        }
        
        return jsonify(summary), 200

    except Exception as e:
        app.logger.error(f"[{g.request_id}] Error generating summary: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": "Error generating summary"}), 500

@app.route("/api/v1/transcribe_with_time", methods=["POST"])
@auth.login_required
@limiter.limit("10 per minute")
@monitor_api_call('transcribe_with_time')
def transcribe_with_time():
    if not client.api_key or client.api_key == "your_openai_api_key":
        app.logger.error(f"[{g.request_id}] OpenAI API key not configured")
        return jsonify({"error": "OpenAI API key not configured. Please set OPENAI_API_KEY in .env file"}), 500

    if "file" not in request.files:
        app.logger.error(f"[{g.request_id}] No file part in request")
        return jsonify({"error": "No file part"}), 400
    
    file = request.files["file"]
    if file.filename == "":
        app.logger.error(f"[{g.request_id}] No selected file")
        return jsonify({"error": "No selected file"}), 400

    try:
        # Generate a unique filename
        temp_path = os.path.join(TEMP_DIR, f"temp_{g.request_id}")
        
        # Save the uploaded file
        file.save(temp_path)
        app.logger.info(f"[{g.request_id}] File saved to {temp_path}")
        
        try:
            # Convert to mp3 (required by Whisper API)
            audio = AudioSegment.from_file(temp_path)
            audio.export(temp_path + ".mp3", format="mp3")
            app.logger.info(f"[{g.request_id}] File converted to MP3")
            
            # Transcribe using OpenAI's Whisper API
            with open(temp_path + ".mp3", "rb") as audio_file:
                app.logger.info(f"[{g.request_id}] Starting transcription with Whisper API")
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )
            
            # Format with timestamp
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            formatted_response = f"{current_time}\n{transcript.text}"
                
            app.logger.info(f"[{g.request_id}] Successfully transcribed audio with timestamp")
            return formatted_response, 200, {'Content-Type': 'text/plain'}
            
        finally:
            # Clean up temporary files
            try:
                os.remove(temp_path)
                if os.path.exists(temp_path + ".mp3"):
                    os.remove(temp_path + ".mp3")
            except Exception as e:
                app.logger.error(f"[{g.request_id}] Error cleaning up temporary files: {str(e)}")
                
    except Exception as e:
        app.logger.error(f"[{g.request_id}] Error processing audio file: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

# Error handler for rate limit exceeded
@app.errorhandler(429)
def ratelimit_handler(e):
    app.logger.warning(f"Rate limit exceeded: {e.description}")
    return jsonify({"error": f"Rate limit exceeded: {e.description}"}), 429

# Error handler for 404 Not Found
@app.errorhandler(404)
def not_found_error(e):
    app.logger.info(f"404 error: {request.url}")
    return jsonify({
        "error": "The requested URL was not found",
        "available_endpoints": {
            "/": "API documentation",
            "/api/v1/transcribe": "POST - Upload audio file for transcription (returns text/plain)",
            "/api/v1/paraphrase": "POST - Paraphrase text (returns text/plain)",
            "/api/v1/paraphrase_logs": "GET - View paraphrase logs (returns text/plain or JSON)",
            "/api/v1/paraphrase_logs/summary": "GET - View paraphrase logs summary (returns JSON)",
            "/api/v1/transcribe_with_time": "POST - Upload audio file for transcription with timestamp (returns text/plain)"
        }
    }), 404

# Error handler for all other exceptions
@app.errorhandler(Exception)
def handle_exception(e):
    app.logger.error(f"Unhandled exception: {str(e)}\n{traceback.format_exc()}")
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    # Print debug information
    app.logger.info(f"System PATH: {os.environ['PATH']}")
    
    # In development only
    app.run(debug=True, host="0.0.0.0", port=5000)
