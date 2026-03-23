"""
EntryClassification — stores AI categorization results, separate from the entry itself.
Keeping this separate allows re-running classification without touching source data.
"""
import uuid
from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class EntryClassification(Base):
    __tablename__ = "entry_classifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entry_id = Column(
        UUID(as_uuid=True),
        ForeignKey("entries.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    # TODO | IDEA | THOUGHT | TIME_RECORD
    category = Column(String(20), nullable=False)
    confidence = Column(Float, nullable=True)
    model_version = Column(String(50), nullable=True)   # track which model produced this
    user_override = Column(Boolean, default=False)      # did user correct the AI?
    classified_at = Column(DateTime(timezone=True), server_default=func.now())

    entry = relationship("Entry", back_populates="classification")
