"""add_chat_history_and_categories

Revision ID: 76e7234cc8af
Revises: 20250108_2030
Create Date: 2025-01-17 04:00:54.418561+00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '76e7234cc8af'
down_revision = '20250108_2030'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create new tables
    op.create_table('chat_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('audio_path', sa.String(), nullable=True),
        sa.Column('transcribed_text', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chat_history_id'), 'chat_history', ['id'], unique=False)
    
    # Create categorized_entries table with content category enum
    content_category_enum = postgresql.ENUM('TODO', 'IDEA', 'THOUGHT', 'TIME_RECORD', name='contentcategory', create_type=False)
    content_category_enum.create(op.get_bind(), checkfirst=True)
    
    op.create_table('categorized_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('chat_history_id', sa.Integer(), nullable=True),
        sa.Column('category', content_category_enum, nullable=True),
        sa.Column('extracted_content', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['chat_history_id'], ['chat_history.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_categorized_entries_id'), 'categorized_entries', ['id'], unique=False)
    
    # Update tasks table enum
    task_category_enum = postgresql.ENUM('STUDY', 'WORKOUT', 'FAMILY_TIME', 'WORK', 'HOBBY', 'OTHER', name='taskcategory', create_type=False)
    task_category_enum.create(op.get_bind(), checkfirst=True)
    
    # Update nullable columns
    op.alter_column('tasks', 'user_id',
               existing_type=sa.INTEGER(),
               nullable=True)
    op.alter_column('tasks', 'start_time',
               existing_type=postgresql.TIMESTAMP(),
               nullable=True)
    op.create_index(op.f('ix_tasks_id'), 'tasks', ['id'], unique=False)
    
    # Update users table
    op.alter_column('users', 'email',
               existing_type=sa.VARCHAR(),
               nullable=True)
    op.alter_column('users', 'username',
               existing_type=sa.VARCHAR(),
               nullable=True)
    op.alter_column('users', 'hashed_password',
               existing_type=sa.VARCHAR(),
               nullable=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)


def downgrade() -> None:
    # Clean up indexes
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_tasks_id'), table_name='tasks')
    
    # Restore column constraints
    op.alter_column('users', 'hashed_password',
               existing_type=sa.VARCHAR(),
               nullable=False)
    op.alter_column('users', 'username',
               existing_type=sa.VARCHAR(),
               nullable=False)
    op.alter_column('users', 'email',
               existing_type=sa.VARCHAR(),
               nullable=False)
    op.alter_column('tasks', 'start_time',
               existing_type=postgresql.TIMESTAMP(),
               nullable=False)
    
    op.alter_column('tasks', 'user_id',
               existing_type=sa.INTEGER(),
               nullable=False)
    
    # Drop new tables
    op.drop_index(op.f('ix_categorized_entries_id'), table_name='categorized_entries')
    op.drop_table('categorized_entries')
    op.drop_index(op.f('ix_chat_history_id'), table_name='chat_history')
    op.drop_table('chat_history')
