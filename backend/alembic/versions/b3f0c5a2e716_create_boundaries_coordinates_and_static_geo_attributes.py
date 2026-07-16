"""create boundaries, coordinates, and static_geo_attributes tables

Revision ID: b3f0c5a2e716
Revises: d55e38e80091
Create Date: 2026-07-16 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from geoalchemy2 import Geometry

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3f0c5a2e716"
down_revision: str | Sequence[str] | None = "d55e38e80091"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "boundaries",
        sa.Column("region", sa.Text(), primary_key=True),
        sa.Column("geom", Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=False),
    )
    op.create_index("ix_boundaries_geom", "boundaries", ["geom"], postgresql_using="gist")

    op.create_table(
        "coordinates",
        sa.Column("region", sa.Text(), sa.ForeignKey("boundaries.region", ondelete="CASCADE"), primary_key=True),
        sa.Column("lat", sa.Float(), primary_key=True),
        sa.Column("lon", sa.Float(), primary_key=True),
    )

    op.create_table(
        "static_geo_attributes",
        sa.Column("lat", sa.Float(), primary_key=True),
        sa.Column("lon", sa.Float(), primary_key=True),
        sa.Column("altitude", sa.Float(), nullable=True),
        sa.Column("dist_m_water", sa.Float(), nullable=True),
        sa.Column("dist_m_sea", sa.Float(), nullable=True),
        sa.Column("climate_zone", sa.Text(), nullable=True),
        sa.Column("ph_level", sa.Float(), nullable=True),
        sa.Column("geom", Geometry(geometry_type="POINT", srid=4326), nullable=False),
    )
    op.create_index("ix_static_geo_attributes_geom", "static_geo_attributes", ["geom"], postgresql_using="gist")


def downgrade() -> None:
    op.drop_index("ix_static_geo_attributes_geom", table_name="static_geo_attributes")
    op.drop_table("static_geo_attributes")
    op.drop_table("coordinates")
    op.drop_index("ix_boundaries_geom", table_name="boundaries")
    op.drop_table("boundaries")
