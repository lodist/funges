"""Create boundaries, coordinates, and static geo attributes.

Revision ID: 0003
Revises: 0002
"""

import geoalchemy2
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "boundaries",
        sa.Column("region_id", sa.String(length=16), primary_key=True),
        sa.Column(
            "geometry",
            geoalchemy2.Geometry("GEOMETRY", srid=4326, spatial_index=False),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_boundaries_geometry",
        "boundaries",
        ["geometry"],
        unique=False,
        postgresql_using="gist",
    )
    op.create_table(
        "coordinates",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "region_id",
            sa.String(length=16),
            sa.ForeignKey("boundaries.region_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "geometry",
            geoalchemy2.Geometry("POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.UniqueConstraint("region_id", "latitude", "longitude", name="uq_region_coordinate"),
    )
    op.create_index(
        "ix_coordinates_geometry",
        "coordinates",
        ["geometry"],
        unique=False,
        postgresql_using="gist",
    )
    op.create_index("ix_coordinates_region", "coordinates", ["region_id"], unique=False)
    op.create_table(
        "static_geo_attributes",
        sa.Column(
            "coordinate_id",
            sa.Integer(),
            sa.ForeignKey("coordinates.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("altitude", sa.Float()),
        sa.Column("dist_m_water", sa.Float()),
        sa.Column("dist_m_sea", sa.Float()),
        sa.Column("climate_zone", sa.String(length=80)),
        sa.Column("ph_level", sa.Float()),
    )


def downgrade() -> None:
    op.drop_table("static_geo_attributes")
    op.drop_index("ix_coordinates_region", table_name="coordinates")
    op.drop_index("ix_coordinates_geometry", table_name="coordinates", postgresql_using="gist")
    op.drop_table("coordinates")
    op.drop_index("ix_boundaries_geometry", table_name="boundaries", postgresql_using="gist")
    op.drop_table("boundaries")

