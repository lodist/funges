"""Create the rolling weather and score master table.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weather_scores",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("region_id", sa.String(length=16), nullable=False),
        sa.Column("location_id", sa.String(length=160), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("latitude", sa.Float()),
        sa.Column("longitude", sa.Float()),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("location_id", "date", name="uq_weather_location_date"),
    )
    op.create_index("ix_weather_scores_region_date", "weather_scores", ["region_id", "date"])
    op.create_index("ix_weather_scores_location", "weather_scores", ["location_id"])


def downgrade() -> None:
    op.drop_index("ix_weather_scores_location", table_name="weather_scores")
    op.drop_index("ix_weather_scores_region_date", table_name="weather_scores")
    op.drop_table("weather_scores")

