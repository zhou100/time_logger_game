"""
E2E tests for authentication flows
"""
import pytest
import logging
from httpx import AsyncClient
import traceback

logger = logging.getLogger(__name__)
pytestmark = pytest.mark.e2e

@pytest.mark.asyncio
async def test_login_refresh_flow(seed_test_data, e2e_db, e2e_client: AsyncClient):
    """Test complete login and token refresh flow."""
    try:
        # Test login
        logger.info("Attempting login with test credentials")
        login_response = await e2e_client.post(
            "/auth/token",
            data={
                "username": "test1@example.com",
                "password": "password123",
                "grant_type": "password"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        logger.info(f"Login response status: {login_response.status_code}")
        logger.info(f"Login response body: {login_response.text}")
        
        assert login_response.status_code == 200, f"Login failed with status {login_response.status_code}: {login_response.text}"
        tokens = login_response.json()
        assert "access_token" in tokens
        assert "token_type" in tokens
        assert "refresh_token" in tokens
        
        # Test accessing protected endpoint
        logger.info("Testing protected endpoint access")
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        me_response = await e2e_client.get("/users/me", headers=headers)
        logger.info(f"Protected endpoint response status: {me_response.status_code}")
        logger.info(f"Protected endpoint response body: {me_response.text}")
        assert me_response.status_code == 200, f"Protected endpoint access failed with status {me_response.status_code}: {me_response.text}"
        
        # Test token refresh
        logger.info("Testing token refresh")
        refresh_response = await e2e_client.post(
            "/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
            headers={"Content-Type": "application/json"}
        )
        logger.info(f"Refresh response status: {refresh_response.status_code}")
        logger.info(f"Refresh response body: {refresh_response.text}")
        assert refresh_response.status_code == 200, f"Token refresh failed with status {refresh_response.status_code}: {refresh_response.text}"
        new_tokens = refresh_response.json()
        assert "access_token" in new_tokens
        assert new_tokens["access_token"] != tokens["access_token"]
    except Exception as e:
        logger.error(f"Test failed with error: {str(e)}")
        logger.error(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
        raise

@pytest.mark.asyncio
async def test_refresh_token_invalid_cases(e2e_client: AsyncClient):
    """Test various invalid cases for token refresh."""
    try:
        # Test missing refresh token
        logger.info("Testing missing refresh token")
        missing_token_response = await e2e_client.post(
            "/auth/refresh",
            json={},
            headers={"Content-Type": "application/json"}
        )
        assert missing_token_response.status_code == 422, "Expected validation error for missing token"
        
        # Test invalid refresh token format
        logger.info("Testing invalid token format")
        invalid_token_response = await e2e_client.post(
            "/auth/refresh",
            json={"refresh_token": "invalid_token_format"},
            headers={"Content-Type": "application/json"}
        )
        assert invalid_token_response.status_code == 401, "Expected unauthorized for invalid token format"
        assert "Invalid refresh token" in invalid_token_response.text
        
        # Test malformed JSON
        logger.info("Testing malformed JSON")
        malformed_response = await e2e_client.post(
            "/auth/refresh",
            content="invalid json content",
            headers={"Content-Type": "application/json"}
        )
        assert malformed_response.status_code == 422, "Expected validation error for malformed JSON"
        
        # Test expired token
        logger.info("Testing expired token")
        expired_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0MUBleGFtcGxlLmNvbSIsImV4cCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        expired_token_response = await e2e_client.post(
            "/auth/refresh",
            json={"refresh_token": expired_token},
            headers={"Content-Type": "application/json"}
        )
        assert expired_token_response.status_code == 401, "Expected unauthorized for expired token"
        assert "Invalid refresh token" in expired_token_response.text
        
    except Exception as e:
        logger.error(f"Test failed with error: {str(e)}")
        logger.error(f"Traceback: {''.join(traceback.format_tb(e.__traceback__))}")
        raise
