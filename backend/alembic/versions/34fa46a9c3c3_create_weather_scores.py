"""create weather_scores table

Revision ID: 34fa46a9c3c3
Revises: b3f0c5a2e716
Create Date: 2026-07-16 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "34fa46a9c3c3"
down_revision: str | Sequence[str] | None = "b3f0c5a2e716"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "weather_scores",
        sa.Column("location_id", sa.Text(), primary_key=True),
        sa.Column("date", sa.Date(), primary_key=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("elevation_m", sa.Float(), nullable=True),
        sa.Column("pressure_hpa", sa.Float(), nullable=True),
        sa.Column("total_precipitation_mm", sa.Float(), nullable=True),
        sa.Column("humidity_pct", sa.Float(), nullable=True),
        sa.Column("wind_speed_ms", sa.Float(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("temperature_c_max", sa.Float(), nullable=True),
        sa.Column("temperature_c_min", sa.Float(), nullable=True),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("dist_m_water", sa.Float(), nullable=True),
        sa.Column("dist_m_sea", sa.Float(), nullable=True),
        sa.Column("climate_zone", sa.Text(), nullable=True),
        sa.Column("ph_level", sa.Float(), nullable=True),
        sa.Column("scores", JSONB(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_table("weather_scores")
