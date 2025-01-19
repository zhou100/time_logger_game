import requests
import os
from datetime import datetime

BASE_URL = "http://localhost:8000"

def test_audio_processing():
    # Step 1: Create a test user
    user_data = {
        "email": "audio_test@example.com",
        "username": "audio_tester",
        "password": "testpass123"
    }
    
    print("\nCreating user...")
    response = requests.post(f"{BASE_URL}/auth/register", json=user_data)
    print(f"Status: {response.status_code}")
    if response.status_code == 201:
        print(f"Response: {response.json()}")
    else:
        print(f"Error: {response.text}")
        if response.status_code != 400 or "Email already registered" not in response.text:
            return
    
    # Step 2: Login
    print("\nLogging in...")
    login_data = {
        "username": user_data["email"],
        "password": user_data["password"],
        "grant_type": "password"
    }
    response = requests.post(
        f"{BASE_URL}/auth/token",
        data=login_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        token = response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        print("Successfully logged in")
    else:
        print(f"Error: {response.text}")
        return
    
    # Step 3: Upload audio file
    print("\nUploading audio file...")
    audio_file_path = os.path.join("tests", "test_audio", "test_recording.wav")
    if not os.path.exists(audio_file_path):
        print(f"Error: Test audio file not found at {audio_file_path}")
        return
        
    with open(audio_file_path, "rb") as f:
        files = {"file": ("test_recording.wav", f, "audio/wav")}
        response = requests.post(
            f"{BASE_URL}/api/audio/upload",
            files=files,
            headers=headers
        )
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print("\nAudio Processing Results:")
        print("-" * 50)
        print(f"Chat History ID: {result.get('chat_history_id')}")
        print(f"\nTranscribed Text:\n{result.get('text')}")
        print("\nExtracted Categories:")
        print("-" * 50)
        for entry in result.get("categorized_entries", []):
            print(f"• {entry['category']}: {entry['content']}")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    test_audio_processing()
