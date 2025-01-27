"""
Tests for custom category endpoints
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.categories import CustomCategory, CategorizedEntry, ContentCategory
from app.models.user import User
from app.core.security import create_access_token


@pytest.fixture
async def test_user(test_db: AsyncSession) -> User:
    """Create a test user."""
    user = User(email="test@example.com", hashed_password="dummy")
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict:
    """Create an access token for the test user."""
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def test_category(test_db: AsyncSession, test_user: User) -> CustomCategory:
    """Create a test custom category."""
    category = CustomCategory(
        name="Test Category",
        color="#FF0000",
        icon="star",
        user_id=test_user.id
    )
    test_db.add(category)
    await test_db.commit()
    await test_db.refresh(category)
    return category


async def test_create_custom_category(
    client: AsyncClient,
    auth_headers: dict
):
    """Test creating a custom category."""
    response = await client.post(
        "/api/v1/categories/custom",
        headers=auth_headers,
        json={
            "name": "Work",
            "color": "#FF0000",
            "icon": "work"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Work"
    assert data["color"] == "#FF0000"
    assert data["icon"] == "work"


async def test_create_custom_category_duplicate_name(
    client: AsyncClient,
    auth_headers: dict,
    test_category: CustomCategory
):
    """Test creating a custom category with a duplicate name."""
    response = await client.post(
        "/api/v1/categories/custom",
        headers=auth_headers,
        json={
            "name": test_category.name,
            "color": "#00FF00",
            "icon": "work"
        }
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


async def test_create_custom_category_invalid_color(
    client: AsyncClient,
    auth_headers: dict
):
    """Test creating a custom category with an invalid color."""
    response = await client.post(
        "/api/v1/categories/custom",
        headers=auth_headers,
        json={
            "name": "Invalid Color",
            "color": "red",  # Not a hex color
            "icon": "work"
        }
    )
    assert response.status_code == 422  # Validation error


async def test_list_categories(
    client: AsyncClient,
    auth_headers: dict,
    test_category: CustomCategory
):
    """Test listing all categories."""
    response = await client.get(
        "/api/v1/categories",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    
    # Check standard categories
    assert "TODO" in data["standard_categories"]
    assert "IDEA" in data["standard_categories"]
    assert "QUESTION" in data["standard_categories"]
    assert "REMINDER" in data["standard_categories"]
    assert "CUSTOM" in data["standard_categories"]
    
    # Check custom categories
    custom_categories = data["custom_categories"]
    assert len(custom_categories) == 1
    assert custom_categories[0]["name"] == test_category.name
    assert custom_categories[0]["color"] == test_category.color
    assert custom_categories[0]["icon"] == test_category.icon


async def test_get_custom_category(
    client: AsyncClient,
    auth_headers: dict,
    test_category: CustomCategory
):
    """Test getting a specific custom category."""
    response = await client.get(
        f"/api/v1/categories/custom/{test_category.id}",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == test_category.name
    assert data["color"] == test_category.color
    assert data["icon"] == test_category.icon


async def test_get_custom_category_not_found(
    client: AsyncClient,
    auth_headers: dict
):
    """Test getting a non-existent custom category."""
    response = await client.get(
        "/api/v1/categories/custom/999",
        headers=auth_headers
    )
    assert response.status_code == 404


async def test_update_custom_category(
    client: AsyncClient,
    auth_headers: dict,
    test_category: CustomCategory
):
    """Test updating a custom category."""
    response = await client.patch(
        f"/api/v1/categories/custom/{test_category.id}",
        headers=auth_headers,
        json={
            "name": "Updated Name",
            "color": "#00FF00"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["color"] == "#00FF00"
    assert data["icon"] == test_category.icon  # Unchanged


async def test_delete_custom_category(
    client: AsyncClient,
    test_db: AsyncSession,
    auth_headers: dict,
    test_category: CustomCategory
):
    """Test deleting a custom category."""
    response = await client.delete(
        f"/api/v1/categories/custom/{test_category.id}",
        headers=auth_headers
    )
    assert response.status_code == 204
    
    # Verify deletion
    result = await test_db.get(CustomCategory, test_category.id)
    assert result is None


async def test_delete_custom_category_in_use(
    client: AsyncClient,
    test_db: AsyncSession,
    auth_headers: dict,
    test_category: CustomCategory,
    test_user: User
):
    """Test deleting a custom category that is in use."""
    # Create an entry using the custom category
    entry = CategorizedEntry(
        text="Test entry",
        category=ContentCategory.CUSTOM,
        custom_category_id=test_category.id,
        user_id=test_user.id,
        audio_id=1  # This might need adjustment based on your test setup
    )
    test_db.add(entry)
    await test_db.commit()
    
    response = await client.delete(
        f"/api/v1/categories/custom/{test_category.id}",
        headers=auth_headers
    )
    assert response.status_code == 400
    assert "in use" in response.json()["detail"]
    
    # Verify category still exists
    result = await test_db.get(CustomCategory, test_category.id)
    assert result is not None
