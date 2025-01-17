import pytest
from fastapi import status
from datetime import datetime, timezone, timedelta, date
from .conftest import test_user, async_client, auth_async_client, test_db
from app.models import ChatHistory, CategorizedEntry, ContentCategory

@pytest.mark.asyncio
async def test_get_all_entries_pagination(auth_async_client, test_user, test_db):
    # Create test entries
    async with test_db as db:
        for i in range(15):
            chat_history = ChatHistory(
                text=f"Test entry {i}",
                user_id=test_user.id,
                created_at=datetime.now(timezone.utc)
            )
            db.add(chat_history)
        await db.commit()

    # Test first page
    response = await auth_async_client.get(
        "/api/categories/entries",
        params={"page": 1, "page_size": 10}
    )
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 10
    assert "total" in data
    assert data["total"] == 15

    # Test second page
    response = await auth_async_client.get(
        "/api/categories/entries",
        params={"page": 2, "page_size": 10}
    )
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 5

@pytest.mark.asyncio
async def test_get_entries_by_category(auth_async_client, test_user, test_db):
    # Create test entry with category
    async with test_db as db:
        chat_history = ChatHistory(
            text="Test todo entry",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc)
        )
        db.add(chat_history)
        await db.commit()
        await db.refresh(chat_history)

        categorized_entry = CategorizedEntry(
            chat_history_id=chat_history.id,
            user_id=test_user.id,  
            category=ContentCategory.todo,
            content="Test todo item",
            created_at=datetime.now(timezone.utc)  
        )
        db.add(categorized_entry)
        await db.commit()

    # Test category filter
    response = await auth_async_client.get(
        "/api/categories/entries",
        params={"category": "todo"}
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 1
    assert data["items"][0]["category"] == "todo"  

@pytest.mark.asyncio
async def test_date_filtering(auth_async_client, test_user, test_db):
    # Create test entries with different dates
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)
    tomorrow = now + timedelta(days=1)

    async with test_db as db:
        # Create entry for yesterday
        chat_history = ChatHistory(
            text="Yesterday's entry",
            user_id=test_user.id,
            created_at=yesterday
        )
        db.add(chat_history)
        
        # Create entry for tomorrow
        chat_history = ChatHistory(
            text="Tomorrow's entry",
            user_id=test_user.id,
            created_at=tomorrow
        )
        db.add(chat_history)
        await db.commit()

    # Test date filtering
    response = await auth_async_client.get(
        "/api/categories/entries",
        params={
            "start_date": yesterday.date().isoformat(),  
            "end_date": now.date().isoformat()  
        }
    )
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 1
    assert data["items"][0]["text"] == "Yesterday's entry"

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
