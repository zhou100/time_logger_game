import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def test_minimal():
    from app.utils.categorization import CategoryType
    assert CategoryType.TODO.value == "TODO"
