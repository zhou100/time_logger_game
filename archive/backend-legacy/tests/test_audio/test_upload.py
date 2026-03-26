import os
import requests

def test_upload():
    url = "http://localhost:8000/api/audio/upload"
    file_path = os.path.join('tests', 'fixtures', 'audio', 'test.wav')
    files = {
        'file': ('test.wav', open(file_path, 'rb'), 'audio/wav')
    }
    response = requests.post(url, files=files)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")

if __name__ == "__main__":
    test_upload()
