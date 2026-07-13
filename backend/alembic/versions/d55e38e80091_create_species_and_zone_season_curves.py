"""create species and zone_season_curves tables

Revision ID: d55e38e80091
Revises: 392754a8e93e
Create Date: 2026-07-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d55e38e80091"
down_revision: str | Sequence[str] | None = "392754a8e93e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "species",
        sa.Column("name", sa.Text(), primary_key=True),
        sa.Column("optimal_temp", sa.Float(), nullable=False),
        sa.Column("temp_sigma", sa.Float(), nullable=False),
        sa.Column("optimal_alt", sa.Float(), nullable=False),
        sa.Column("alt_sigma", sa.Float(), nullable=False),
        sa.Column("optimal_humidity", sa.Float(), nullable=False),
        sa.Column("humidity_sigma", sa.Float(), nullable=False),
        sa.Column("optimal_pH", sa.Float(), nullable=False),
        sa.Column("pH_sigma_near", sa.Float(), nullable=False),
        sa.Column("pH_sigma_far", sa.Float(), nullable=False),
        sa.Column("min_cumulative_rain", sa.Float(), nullable=False),
        sa.Column("wind_sensitive", sa.Boolean(), nullable=False),
        sa.Column("water_relevance", sa.Boolean(), nullable=False),
        sa.Column("sea_relevance", sa.Boolean(), nullable=False),
        sa.Column("weather_preference", JSONB(), nullable=False),
        sa.Column("climate_zones", JSONB(), nullable=False),
        sa.Column("pH_range_near", JSONB(), nullable=False),
        sa.Column("season_curve", JSONB(), nullable=True),
        sa.Column("season_months", JSONB(), nullable=True),
        sa.Column("season_factor", sa.Float(), nullable=True),
    )

    op.create_table(
        "zone_season_curves",
        sa.Column("climate_zone", sa.Text(), primary_key=True),
        sa.Column("species", sa.Text(), sa.ForeignKey("species.name", ondelete="CASCADE"), primary_key=True),
        sa.Column("month", sa.Integer(), primary_key=True),
        sa.Column("multiplier", sa.Float(), nullable=False),
        sa.CheckConstraint("month >= 1 AND month <= 12", name="zone_season_curves_month_range"),
    )


def downgrade() -> None:
    op.drop_table("zone_season_curves")
    op.drop_table("species")
