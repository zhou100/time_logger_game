"""
Test category functionality
"""
import pytest
from .conftest import test_user, async_client, auth_async_client, test_db
from app.models import Audio, CategorizedEntry, ContentCategory
from datetime import datetime, timedelta

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

        # Create multiple entries
        for i in range(15):  # Create 15 entries
            entry = CategorizedEntry(
                text=f"Test entry {i}",
                category=ContentCategory.TODO,
                audio_id=audio.id
            )
            db.add(entry)
        await db.commit()

        # Test first page (default 10 items)
        response = await auth_async_client.get("/api/categories/entries")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 10
        assert data["total"] == 15
        assert data["page"] == 1
        assert data["size"] == 10

        # Test second page
        response = await auth_async_client.get("/api/categories/entries?page=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 5  # Remaining 5 items
        assert data["total"] == 15
        assert data["page"] == 2

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
        entry = CategorizedEntry(
            text="Test TODO",
            audio_id=audio.id,
            category=ContentCategory.TODO
        )
        db.add(entry)

        entry = CategorizedEntry(
            text="Test IDEA",
            audio_id=audio.id,
            category=ContentCategory.IDEA
        )
        db.add(entry)
        await db.commit()

        # Test getting TODO entries
        response = await auth_async_client.get("/api/categories/entries?category=TODO")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["text"] == "Test TODO"
        assert data["items"][0]["category"] == "TODO"

        # Test getting IDEA entries
        response = await auth_async_client.get("/api/categories/entries?category=IDEA")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["text"] == "Test IDEA"
        assert data["items"][0]["category"] == "IDEA"

@pytest.mark.asyncio
async def test_date_filtering(auth_async_client, test_user, test_db):
    """Test date filtering for entries"""
    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)
    tomorrow = now + timedelta(days=1)

    async with test_db as db:
        # Create test data
        audio = Audio(
            transcribed_text="Test message",
            user_id=test_user.id,
            created_at=yesterday
        )
        db.add(audio)
        await db.commit()

        audio2 = Audio(
            transcribed_text="Test message 2",
            user_id=test_user.id,
            created_at=tomorrow
        )
        db.add(audio2)
        await db.commit()

        # Create entries for both audios
        entry1 = CategorizedEntry(
            text="Test entry 1",
            category=ContentCategory.TODO,
            audio_id=audio.id,
            created_at=yesterday
        )
        db.add(entry1)

        entry2 = CategorizedEntry(
            text="Test entry 2",
            category=ContentCategory.TODO,
            audio_id=audio2.id,
            created_at=tomorrow
        )
        db.add(entry2)
        await db.commit()

        # Test filtering by start_date
        response = await auth_async_client.get(
            f"/api/categories/entries?start_date={now.date()}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["text"] == "Test entry 2"

        # Test filtering by end_date
        response = await auth_async_client.get(
            f"/api/categories/entries?end_date={now.date()}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["text"] == "Test entry 1"

        # Test filtering by date range
        response = await auth_async_client.get(
            f"/api/categories/entries?start_date={yesterday.date()}&end_date={tomorrow.date()}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2

@pytest.mark.asyncio
async def test_invalid_parameters(auth_async_client, test_user):
    # Test invalid page number
    response = await auth_async_client.get(
        "/api/categories/entries",
        params={"page": 0}
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # Test invalid page size
    response = await auth_async_client.get(
        "/api/categories/entries",
        params={"page_size": 0}
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

@pytest.mark.asyncio
async def test_unauthorized_access(async_client):
    # Test without auth token
    response = await async_client.get("/api/categories/entries")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert "Not authenticated" in data["detail"]
