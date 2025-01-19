import requests
import os
from datetime import datetime
import json

BASE_URL = "http://localhost:8000"

def test_real_mandarin_audio():
    # Step 1: Create a test user
    user_data = {
        "email": "real_mandarin_test@example.com",
        "username": "real_mandarin_tester",
        "password": "testpass123"
    }
    
    print("\nCreating user...")
    response = requests.post(f"{BASE_URL}/auth/register", json=user_data)
    print(f"Status: {response.status_code}")
    if response.status_code == 201:
        print(f"Response: {json.dumps(response.json(), ensure_ascii=False)}")
    else:
        print(f"Error: {response.text}")
        if response.status_code != 400 or "Email already registered" not in response.text:
            return
    
    # Step 2: Login using OAuth2 password flow
    print("\nLogging in...")
    login_data = {
        "username": user_data["email"],
        "password": user_data["password"]
    }
    response = requests.post(
        f"{BASE_URL}/auth/token",
        data=login_data
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        token = response.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        print("Successfully logged in")
    else:
        print(f"Error: {response.text}")
        return
    
    # Step 3: Upload real Mandarin audio file
    print("\nUploading real Mandarin audio file...")
    audio_file_path = os.path.join("tests", "test_audio", "Recording.m4a")
    if not os.path.exists(audio_file_path):
        print(f"Error: Test audio file not found at {audio_file_path}")
        return
        
    with open(audio_file_path, "rb") as f:
        files = {"file": ("Recording.m4a", f, "audio/m4a")}
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
        print(f"\nTranscribed Text:\n{json.dumps(result.get('text'), ensure_ascii=False, indent=2)}")
        
        # Step 4: Retrieve chat history with categories
        chat_id = result.get('chat_history_id')
        if chat_id:
            print("\nRetrieving chat history with categories...")
            response = requests.get(
                f"{BASE_URL}/api/chat/history/{chat_id}",
                headers=headers
            )
            if response.status_code == 200:
                history = response.json()
                print("\nCategories from database:")
                print("-" * 50)
                for entry in history.get("categorized_entries", []):
                    print(f"• {entry['category']}: {json.dumps(entry['content'], ensure_ascii=False, indent=2)}")
            else:
                print(f"Error retrieving chat history: {response.text}")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    # Set console to UTF-8 mode
    import sys
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer)
    test_real_mandarin_audio()
