"""
Test users router
"""
import logging
import pytest
from httpx import AsyncClient
from app.models.user import User

logger = logging.getLogger(__name__)

@pytest.mark.asyncio
async def test_get_current_user(e2e_client: AsyncClient, test_user: User, access_token: str):
    """Test get current user info."""
    logger.info("Testing get current user info")
    response = await e2e_client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == test_user.email
    assert data["is_active"] == test_user.is_active
