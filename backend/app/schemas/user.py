"""
User schemas
"""
from pydantic import BaseModel, EmailStr

class UserResponse(BaseModel):
    """User response schema."""
    id: int
    email: EmailStr
    is_active: bool

    class Config:
        """Pydantic config."""
        from_attributes = True
