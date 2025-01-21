"""
Test category functionality
"""
import pytest
from fastapi import status
from datetime import datetime, timezone, timedelta
from .conftest import test_user, async_client, auth_async_client, test_db
from app.models import Audio, CategorizedEntry, ContentCategory

@pytest.mark.asyncio
async def test_get_all_entries_pagination(auth_async_client, test_user, test_db):
    """Test getting all entries with pagination"""
    async with test_db as db:
        # Create test data
        audio = Audio(
            transcribed_text="Test message",
            user_id=test_user.id  # Use user.id instead of user['id']
        )
        db.add(audio)
        await db.commit()
        await db.refresh(audio)

        # Create some categorized entries
        entries = []
        for i in range(5):
            entry = CategorizedEntry(
                text=f"Test entry {i}",
                category=ContentCategory.TODO,
                audio_id=audio.id,
                user_id=test_user.id  # Use user.id instead of user['id']
            )
            entries.append(entry)
        
        db.add_all(entries)
        await db.commit()

    # Test pagination
    response = await auth_async_client.get("/api/categories/entries?skip=0&limit=3")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data["entries"]) == 3

@pytest.mark.asyncio
async def test_get_entries_by_category(auth_async_client, test_user, test_db):
    """Test getting entries by category"""
    async with test_db as db:
        # Create test data
        audio = Audio(
            transcribed_text="Test message",
            user_id=test_user.id  # Use user.id instead of user['id']
        )
        db.add(audio)
        await db.commit()
        await db.refresh(audio)

        # Create entries with different categories
        entries = [
            CategorizedEntry(
                text="TODO entry",
                category=ContentCategory.TODO,
                audio_id=audio.id,
                user_id=test_user.id  # Use user.id instead of user['id']
            ),
            CategorizedEntry(
                text="IDEA entry",
                category=ContentCategory.IDEA,
                audio_id=audio.id,
                user_id=test_user.id  # Use user.id instead of user['id']
            )
        ]
        db.add_all(entries)
        await db.commit()

    # Test filtering by category
    response = await auth_async_client.get("/api/categories/entries?category=TODO")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data["entries"]) == 1
    assert data["entries"][0]["category"] == "TODO"

@pytest.mark.asyncio
async def test_date_filtering(auth_async_client, test_user, test_db):
    """Test date filtering for entries"""
    async with test_db as db:
        # Create test data
        audio = Audio(
            transcribed_text="Test message",
            user_id=test_user.id  # Use user.id instead of user['id']
        )
        db.add(audio)
        await db.commit()
        await db.refresh(audio)

        # Create entries with different dates
        now = datetime.now(timezone.utc)
        entries = [
            CategorizedEntry(
                text="Old entry",
                category=ContentCategory.TODO,
                audio_id=audio.id,
                user_id=test_user.id,  # Use user.id instead of user['id']
                created_at=now - timedelta(days=2)
            ),
            CategorizedEntry(
                text="New entry",
                category=ContentCategory.TODO,
                audio_id=audio.id,
                user_id=test_user.id,  # Use user.id instead of user['id']
                created_at=now
            )
        ]
        db.add_all(entries)
        await db.commit()

    # Test date filtering
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    response = await auth_async_client.get(f"/api/categories/entries?start_date={yesterday}")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data["entries"]) == 1
    assert data["entries"][0]["text"] == "New entry"

@pytest.mark.asyncio
async def test_invalid_parameters(auth_async_client):
    """Test invalid query parameters"""
    response = await auth_async_client.get("/api/categories/entries?limit=invalid")
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

@pytest.mark.asyncio
async def test_unauthorized_access(async_client):
    """Test unauthorized access to endpoints"""
    response = await async_client.get("/api/categories/entries")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
