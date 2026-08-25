"""Store base points and habitat polygons used by the production pipeline.

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "base_points",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("region_id", sa.String(length=16), nullable=False),
        sa.Column("location_id", sa.String(length=160), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "coordinate_id", sa.Integer(), sa.ForeignKey("coordinates.id", ondelete="SET NULL")
        ),
        sa.Column(
            "payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.UniqueConstraint("region_id", "location_id", name="uq_base_point_region_location"),
    )
    op.create_index("ix_base_points_region", "base_points", ["region_id"])
    op.create_table(
        "habitat_polygons",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("region_id", sa.String(length=16), nullable=False),
        sa.Column("raster_val", sa.Integer()),
        sa.Column("geometry", Geometry("GEOMETRY", srid=4326, spatial_index=False), nullable=False),
    )
    op.create_index("ix_habitat_polygons_region", "habitat_polygons", ["region_id"])
    op.create_index(
        "ix_habitat_polygons_geometry", "habitat_polygons", ["geometry"], postgresql_using="gist"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_habitat_polygons_geometry", table_name="habitat_polygons", postgresql_using="gist"
    )
    op.drop_index("ix_habitat_polygons_region", table_name="habitat_polygons")
    op.drop_table("habitat_polygons")
    op.drop_index("ix_base_points_region", table_name="base_points")
    op.drop_table("base_points")
