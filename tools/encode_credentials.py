#!/usr/bin/env python3
import base64
import argparse

def encode_credentials(username, password):
    """Encode username and password for HTTP Basic Auth."""
    credentials = f"{username}:{password}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return f"Basic {encoded}"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Encode credentials for HTTP Basic Auth')
    parser.add_argument('username', help='API username')
    parser.add_argument('password', help='API password')
    
    args = parser.parse_args()
    
    print("\nEncoded credentials for HTTP Basic Auth:")
    print("----------------------------------------")
    print(encode_credentials(args.username, args.password))
    print("\nUse this value in the Authorization header of your HTTP requests")
