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
            user_id=test_user.id
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
                user_id=test_user.id
            )
            entries.append(entry)
        
        db.add_all(entries)
        await db.commit()

    # Test pagination
    response = await auth_async_client.get("/api/v1/categories/entries?size=3&offset=0")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 3

@pytest.mark.asyncio
async def test_get_entries_by_category(auth_async_client, test_user, test_db):
    """Test getting entries by category"""
    async with test_db as db:
        # Create test data
        audio = Audio(
            transcribed_text="Test message",
            user_id=test_user.id
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
                user_id=test_user.id
            ),
            CategorizedEntry(
                text="IDEA entry",
                category=ContentCategory.IDEA,
                audio_id=audio.id,
                user_id=test_user.id
            )
        ]
        db.add_all(entries)
        await db.commit()

    # Test filtering by category
    response = await auth_async_client.get("/api/v1/categories/entries?category=TODO")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["category"] == "TODO"

@pytest.mark.asyncio
async def test_date_filtering(auth_async_client, test_user, test_db):
    """Test date filtering for entries"""
    async with test_db as db:
        # Create test data
        audio = Audio(
            transcribed_text="Test message",
            user_id=test_user.id
        )
        db.add(audio)
        await db.commit()
        await db.refresh(audio)

        # Create entries with different dates
        now = datetime.now(timezone.utc)
        old_date = now - timedelta(days=7)
        
        entries = [
            CategorizedEntry(
                text="Old entry",
                category=ContentCategory.TODO,
                audio_id=audio.id,
                user_id=test_user.id,
                created_at=old_date
            ),
            CategorizedEntry(
                text="New entry",
                category=ContentCategory.TODO,
                audio_id=audio.id,
                user_id=test_user.id,
                created_at=now
            )
        ]
        db.add_all(entries)
        await db.commit()

    # Test filtering by date range
    start_date = (now - timedelta(days=1)).isoformat()
    response = await auth_async_client.get(f"/api/v1/categories/entries?start_date={start_date}")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["text"] == "New entry"

@pytest.mark.asyncio
async def test_invalid_parameters(auth_async_client):
    """Test invalid query parameters"""
    # Test invalid category
    response = await auth_async_client.get("/api/v1/categories/entries?category=INVALID")
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # Test invalid size
    response = await auth_async_client.get("/api/v1/categories/entries?size=-1")
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

@pytest.mark.asyncio
async def test_unauthorized_access(async_client):
    """Test unauthorized access to endpoints"""
    # Test accessing entries without auth
    response = await async_client.get("/api/v1/categories/entries")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # Test creating entry without auth
    response = await async_client.post("/api/v1/categories/entries", json={
        "text": "Test entry",
        "category": "TODO",
        "audio_id": 1
    })
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.asyncio
async def test_custom_categories(auth_async_client, test_user, test_db):
    """Test custom category operations"""
    # Create custom category
    create_response = await auth_async_client.post("/api/v1/categories/custom", json={
        "name": "Test Category",
        "color": "#FF0000",
        "icon": "test-icon"
    })
    assert create_response.status_code == status.HTTP_201_CREATED
    category_data = create_response.json()
    category_id = category_data["id"]

    # Get custom category
    get_response = await auth_async_client.get(f"/api/v1/categories/custom/{category_id}")
    assert get_response.status_code == status.HTTP_200_OK
    assert get_response.json()["name"] == "Test Category"

    # Update custom category
    update_response = await auth_async_client.patch(f"/api/v1/categories/custom/{category_id}", json={
        "name": "Updated Category"
    })
    assert update_response.status_code == status.HTTP_200_OK
    assert update_response.json()["name"] == "Updated Category"

    # Delete custom category
    delete_response = await auth_async_client.delete(f"/api/v1/categories/custom/{category_id}")
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT

    # Verify deletion
    get_response = await auth_async_client.get(f"/api/v1/categories/custom/{category_id}")
    assert get_response.status_code == status.HTTP_404_NOT_FOUND
