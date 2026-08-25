"""Create species and zone season-curve tables.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "species",
        sa.Column("id", sa.String(length=80), primary_key=True),
        sa.Column("scientific_name", sa.Text()),
        sa.Column("optimal_temp", sa.Float()),
        sa.Column("temp_sigma", sa.Float()),
        sa.Column("optimal_alt", sa.Float()),
        sa.Column("alt_sigma", sa.Float()),
        sa.Column("optimal_humidity", sa.Float()),
        sa.Column("humidity_sigma", sa.Float()),
        sa.Column("optimal_ph", sa.Float()),
        sa.Column("ph_sigma_near", sa.Float()),
        sa.Column("ph_sigma_far", sa.Float()),
        sa.Column("min_cumulative_rain", sa.Float()),
        sa.Column("wind_sensitive", sa.Boolean()),
        sa.Column("water_relevance", sa.Boolean()),
        sa.Column("sea_relevance", sa.Boolean()),
        sa.Column("weather_preference", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("climate_zones", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("ph_range_near", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("season_curve", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("season_months", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column(
            "extra_params",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_table(
        "zone_season_curves",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("climate_zone", sa.String(length=80), nullable=False),
        sa.Column(
            "species_id",
            sa.String(length=80),
            sa.ForeignKey("species.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("multiplier", sa.Float(), nullable=False),
        sa.Column("ratio", sa.Float()),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="ck_zone_curve_month"),
        sa.UniqueConstraint(
            "climate_zone", "species_id", "month", name="uq_zone_species_month"
        ),
    )


def downgrade() -> None:
    op.drop_table("zone_season_curves")
    op.drop_table("species")
