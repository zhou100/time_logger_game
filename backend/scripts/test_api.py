import requests
import json
from datetime import datetime, timedelta
import pytz

BASE_URL = "http://localhost:8000"

def test_api():
    # Create a user
    user_data = {
        "email": "test@example.com",
        "username": "testuser",
        "password": "testpass123"
    }
    
    print("\nCreating user...")
    response = requests.post(f"{BASE_URL}/auth/register", json=user_data)
    print(f"Status: {response.status_code}")
    if response.status_code == 200 or response.status_code == 201:
        print(f"Response: {response.json()}")
    else:
        print(f"Error: {response.text}")
    
    # Login
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
    
    # Create a task
    task_data = {
        "category": "TODO",  # This is valid because FastAPI will convert string to enum
        "description": "Test task"
    }
    
    print("\nCreating task...")
    response = requests.post(f"{BASE_URL}/tasks/", json=task_data, headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200 or response.status_code == 201:
        print(f"Response: {response.json()}")
        task_id = response.json().get("id")
    else:
        print(f"Error: {response.text}")
        return
    
    # Complete the task
    complete_data = {
        "duration": 30  # Duration in seconds
    }
    
    print("\nCompleting task...")
    response = requests.put(f"{BASE_URL}/tasks/{task_id}/complete", json=complete_data, headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        print(f"Response: {response.json()}")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    test_api()
