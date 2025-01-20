"""
Test importing models
"""
def test_import_models():
    """Test that we can import models without errors"""
    from app.models.base import Base
    from app.models.user import User
    from app.models.audio import Audio
    
    assert Base is not None
    assert User is not None
    assert Audio is not None
