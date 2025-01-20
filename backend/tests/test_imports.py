"""
Test imports directly
"""
print("Starting imports...")
print("Importing Base...")
from app.models.base import Base
print("Base imported successfully")

print("Importing User...")
from app.models.user import User
print("User imported successfully")

print("Importing Audio...")
from app.models.audio import Audio
print("Audio imported successfully")

print("All imports successful!")
