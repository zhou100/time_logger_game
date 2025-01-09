"""initial migration

Revision ID: 20250108_2030
Revises: 
Create Date: 2025-01-08 20:30:45.000000

"""
from alembic import op
import sqlalchemy as sa
from app.models import TaskCategory

# revision identifiers, used by Alembic.
revision = '20250108_2030'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Create tables
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    
    # Create tasks table
    op.create_table('tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('category', sa.Enum(TaskCategory, name='task_category', create_type=False), nullable=False),
        sa.Column('start_time', sa.DateTime(), nullable=False),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('tasks')
    op.drop_table('users')
