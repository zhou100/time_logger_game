import requests

def test_upload():
    url = "http://localhost:8000/api/audio/upload"
    files = {
        'file': ('test.wav', open('test.wav', 'rb'), 'audio/wav')
    }
    response = requests.post(url, files=files)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")

if __name__ == "__main__":
    test_upload()
