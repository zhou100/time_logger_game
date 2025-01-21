"""
Test advanced category functionality
"""
import pytest
import logging
import asyncio
import time
from datetime import datetime
from httpx import AsyncClient
from sqlalchemy import select, and_
from app.models.audio import Audio
from app.models.categories import ContentCategory, CategorizedEntry
from app.main import app
from app.models.user import User
from app.dependencies import get_current_user, get_db

logger = logging.getLogger(__name__)

@pytest.mark.asyncio
async def test_concurrent_category_creation(db_session, test_user, client):
    """Test creating multiple category entries concurrently."""
    logger.info("Starting concurrent category creation test")
    
    # Create base audio entry
    audio = Audio(
        user_id=test_user["id"],
        transcribed_text="Performance test audio"
    )
    db_session.add(audio)
    await db_session.commit()
    await db_session.refresh(audio)
    
    logger.info(f"Created test audio entry with ID: {audio.id}")

    # Create entries concurrently
    async def create_entries():
        tasks = []
        for i in range(10):
            response = await client.post(
                "/api/v1/categories/entries",
                json={
                    "text": f"Concurrent entry {i}",
                    "category": ContentCategory.TODO.value,
                    "audio_id": audio.id
                }
            )
            logger.info(f"Entry {i} creation response: {response.status_code}")
            if response.status_code != 201:
                logger.error(f"Entry {i} creation failed: {response.text}")
            tasks.append(response.status_code == 201)
        return tasks

    # Run concurrent tasks
    tasks = []
    for _ in range(5):  # 5 concurrent batches
        task = asyncio.create_task(create_entries())
        tasks.append(task)
    
    results = await asyncio.gather(*tasks)
    
    # Verify results
    assert all(all(batch) for batch in results), "Some concurrent creations failed"
    
    # Verify total count
    stmt = select(CategorizedEntry).where(
        and_(
            CategorizedEntry.audio_id == audio.id,
            CategorizedEntry.user_id == test_user["id"]
        )
    )
    result = await db_session.execute(stmt)
    entries = result.scalars().all()
    assert len(entries) == 50, "Expected 50 entries after concurrent creation"

@pytest.mark.asyncio
async def test_edge_case_categories(db_session, test_user, client):
    """Test edge cases for category operations."""
    logger.info("Starting edge case category test")
    
    # Create base audio entry
    audio = Audio(
        user_id=test_user["id"],
        transcribed_text="Edge case test audio"
    )
    db_session.add(audio)
    await db_session.commit()
    await db_session.refresh(audio)
    
    # Test very long text
    response = await client.post(
        "/api/v1/categories/entries",
        json={
            "text": "x" * 10000,  # Very long text
            "category": ContentCategory.TODO.value,
            "audio_id": audio.id
        }
    )
    assert response.status_code == 201, f"Failed to create entry with long text: {response.text}"
    
    # Test empty text (should fail)
    response = await client.post(
        "/api/v1/categories/entries",
        json={
            "text": "",  # Empty text
            "category": ContentCategory.TODO.value,
            "audio_id": audio.id
        }
    )
    assert response.status_code == 422, "Should reject empty text"
    
    # Test invalid category
    response = await client.post(
        "/api/v1/categories/entries",
        json={
            "text": "Test text",
            "category": "INVALID_CATEGORY",  # Invalid category
            "audio_id": audio.id
        }
    )
    assert response.status_code == 422, "Should reject invalid category"

@pytest.mark.asyncio
async def test_bulk_category_operations(db_session, test_user, client):
    """Test bulk operations for categories."""
    logger.info("Starting bulk category operations test")
    
    # Create base audio entry
    audio = Audio(
        user_id=test_user["id"],
        transcribed_text="Bulk test audio"
    )
    db_session.add(audio)
    await db_session.commit()
    await db_session.refresh(audio)
    
    # Create multiple entries
    entries = []
    for i in range(100):
        response = await client.post(
            "/api/v1/categories/entries",
            json={
                "text": f"Bulk entry {i}",
                "category": ContentCategory.TODO.value,
                "audio_id": audio.id
            }
        )
        assert response.status_code == 201, f"Failed to create entry {i}: {response.text}"
        entries.append(response.json())
    
    # Verify bulk retrieval
    response = await client.get(
        f"/api/v1/categories/entries/audio/{audio.id}"
    )
    assert response.status_code == 200, f"Failed to retrieve entries: {response.text}"
    assert len(response.json()) == 100, f"Expected 100 entries, got {len(response.json())}"

@pytest.mark.asyncio
async def test_category_error_handling(db_session, test_user, client):
    """Test error handling in category operations."""
    logger.info("Starting error handling test")
    
    # Test non-existent audio ID
    response = await client.post(
        "/api/v1/categories/entries",
        json={
            "text": "Test text",
            "category": ContentCategory.TODO.value,
            "audio_id": 99999  # Non-existent audio ID
        }
    )
    assert response.status_code == 404, f"Expected 404 for non-existent audio ID, got {response.status_code}: {response.text}"
    
    # Test missing required fields
    response = await client.post(
        "/api/v1/categories/entries",
        json={
            "text": "Test text"
            # Missing category and audio_id
        }
    )
    assert response.status_code == 422, f"Expected 422 for missing fields, got {response.status_code}: {response.text}"

@pytest.mark.asyncio
async def test_category_performance(db_session, test_user, client):
    """Test performance with large number of categories."""
    logger.info("Starting performance test for category operations")
    
    # Create base audio entry
    audio = Audio(
        user_id=test_user["id"],
        transcribed_text="Performance test audio"
    )
    db_session.add(audio)
    await db_session.commit()
    await db_session.refresh(audio)
    
    logger.info(f"Created test audio entry with ID: {audio.id}")
    
    # Create 100 entries in parallel
    async def create_entries(start_idx, count):
        tasks = []
        for i in range(start_idx, start_idx + count):
            response = await client.post(
                "/api/v1/categories/entries",
                json={
                    "text": f"Performance entry {i}",
                    "category": ContentCategory.TODO.value,
                    "audio_id": audio.id
                }
            )
            tasks.append(response.status_code == 201)
            if response.status_code != 201:
                logger.error(f"Failed to create entry {i}: {response.text}")
        return tasks
    
    # Create entries in batches of 20
    batch_size = 20
    total_entries = 100
    results = []
    
    start_time = datetime.now()
    
    # Create batches
    tasks = []
    for i in range(0, total_entries, batch_size):
        task = asyncio.create_task(create_entries(i, batch_size))
        tasks.append(task)
    
    batch_results = await asyncio.gather(*tasks)
    results.extend([item for sublist in batch_results for item in sublist])
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    # Log performance metrics
    logger.info(f"Created {len(results)} entries in {duration:.2f} seconds")
    logger.info(f"Average time per entry: {(duration/len(results))*1000:.2f}ms")
    
    # Verify all entries were created successfully
    assert all(results), "Some entries failed to create"
    assert len(results) == total_entries, f"Expected {total_entries} entries, got {len(results)}"
