import sys
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from src.main import app
from src.models.user import Base
from src.routes.auth import get_db

# Use in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="function")
def test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client():
    with TestClient(app) as test_client:
        yield test_client

def test_register(client, test_db):
    response = client.post(
        "/api/register",
        json={"email": "test@example.com", "password": "testpassword"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "id" in data
    assert data["is_active"] is True

def test_register_duplicate_email(client, test_db):
    # Register first user
    client.post(
        "/api/register",
        json={"email": "test@example.com", "password": "testpassword"}
    )
    
    # Try to register with same email
    response = client.post(
        "/api/register",
        json={"email": "test@example.com", "password": "testpassword2"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"

def test_login(client, test_db):
    # Register user first
    client.post(
        "/api/register",
        json={"email": "test@example.com", "password": "testpassword"}
    )
    
    # Try to login
    response = client.post(
        "/api/token",
        data={"username": "test@example.com", "password": "testpassword"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_wrong_password(client, test_db):
    # Register user first
    client.post(
        "/api/register",
        json={"email": "test@example.com", "password": "testpassword"}
    )
    
    # Try to login with wrong password
    response = client.post(
        "/api/token",
        data={"username": "test@example.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"
