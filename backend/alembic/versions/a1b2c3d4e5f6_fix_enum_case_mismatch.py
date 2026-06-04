"""fix_enum_case_mismatch

Revision ID: a1b2c3d4e5f6
Revises: 1a3f9c2b5e7d
Create Date: 2026-06-04 16:10:00.000000

The initial migration (f2272edda78c) created Postgres enum types using
uppercase member NAMES (e.g. 'OFF_CAMPUS') instead of the lowercase
StrEnum VALUES (e.g. 'off_campus') that SQLAlchemy sends at runtime.

This migration renames every enum value from uppercase to lowercase so
the database accepts the values that the ORM actually sends.

ALTER TYPE ... RENAME VALUE is available since Postgres 10 and is
transactional — safe for production with zero downtime.
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: str | Sequence[str] | None = '5a2d7c8e9b10'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Mapping: (enum_type_name, [(old_uppercase, new_lowercase), ...])
_ENUM_RENAMES: list[tuple[str, list[tuple[str, str]]]] = [
    ('user_role', [
        ('SEEKER', 'seeker'),
        ('LANDLORD', 'landlord'),
        ('AGENT', 'agent'),
        ('INSPECTOR', 'inspector'),
        ('TRUSTED_AGENT', 'trusted_agent'),
        ('ADMIN', 'admin'),
    ]),
    ('account_type', [
        ('INDIVIDUAL', 'individual'),
        ('AGENCY', 'agency'),
    ]),
    ('listing_category', [
        ('OFF_CAMPUS', 'off_campus'),
        ('SHORT_LET', 'short_let'),
        ('RENT', 'rent'),
        ('SALES', 'sales'),
    ]),
    ('listing_status', [
        ('DRAFT', 'draft'),
        ('UNDER_DOC_REVIEW', 'under_doc_review'),
        ('LIVE_UNVERIFIED', 'live_unverified'),
        ('DOC_VERIFIED', 'doc_verified'),
        ('FULLY_VERIFIED', 'fully_verified'),
        ('LET_AGREED', 'let_agreed'),
        ('SALE_AGREED', 'sale_agreed'),
        ('SUSPENDED', 'suspended'),
        ('DELISTED', 'delisted'),
    ]),
    ('gender', [
        ('FEMALE', 'female'),
        ('MALE', 'male'),
        ('ANY', 'any'),
    ]),
    ('badge_type', [
        ('DOCUMENT', 'document'),
        ('PHYSICAL', 'physical'),
    ]),
    ('badge_status', [
        ('ACTIVE', 'active'),
        ('REVOKED', 'revoked'),
        ('EXPIRED', 'expired'),
    ]),
    ('offer_status', [
        ('PENDING', 'pending'),
        ('ACCEPTED', 'accepted'),
        ('REJECTED', 'rejected'),
        ('COUNTERED', 'countered'),
        ('EXPIRED', 'expired'),
        ('WITHDRAWN', 'withdrawn'),
    ]),
    ('agreement_status', [
        ('DRAFT', 'draft'),
        ('PARTIAL_SIGNED', 'partial_signed'),
        ('PENDING_PAYMENT', 'pending_payment'),
        ('SIGNED', 'signed'),
        ('ACTIVE', 'active'),
        ('EXPIRED', 'expired'),
        ('TERMINATED', 'terminated'),
    ]),
    ('agreement_type', [
        ('TENANCY', 'tenancy'),
        ('SALE', 'sale'),
    ]),
    ('unit_kind', [
        ('SINGLE_ROOM', 'single_room'),
        ('TWO_IN_A_ROOM', 'two_in_a_room'),
        ('THREE_IN_A_ROOM', 'three_in_a_room'),
        ('SELF_CONTAIN', 'self_contain'),
        ('CUSTOM', 'custom'),
    ]),
    ('bed_status', [
        ('OCCUPIED', 'occupied'),
        ('AVAILABLE', 'available'),
        ('VACATING', 'vacating'),
    ]),
    ('booking_status', [
        ('REQUESTED', 'requested'),
        ('CONFIRMED', 'confirmed'),
        ('CANCELLED', 'cancelled'),
        ('COMPLETED', 'completed'),
    ]),
    ('visit_status', [
        ('PENDING_ASSIGNMENT', 'pending_assignment'),
        ('AGENT_ASSIGNED', 'agent_assigned'),
        ('SCHEDULED', 'scheduled'),
        ('REPORT_PENDING', 'report_pending'),
        ('COMPLETED', 'completed'),
        ('CANCELLED', 'cancelled'),
        ('REPORT_QUERIED', 'report_queried'),
    ]),
    ('visit_cancelled_by', [
        ('SEEKER', 'seeker'),
        ('LANDLORD', 'landlord'),
        ('AGENT', 'agent'),
        ('ADMIN', 'admin'),
    ]),
    ('inspection_report_status', [
        ('ASSIGNED', 'assigned'),
        ('IN_PROGRESS', 'in_progress'),
        ('PENDING', 'pending'),
        ('APPROVED', 'approved'),
        ('QUERIED', 'queried'),
        ('REJECTED', 'rejected'),
    ]),
    ('notification_channel', [
        ('EMAIL', 'email'),
        ('WHATSAPP', 'whatsapp'),
        ('IN_APP', 'in_app'),
    ]),
    ('notification_status', [
        ('QUEUED', 'queued'),
        ('SENT', 'sent'),
        ('DELIVERED', 'delivered'),
        ('FAILED', 'failed'),
    ]),
]


def upgrade() -> None:
    for enum_name, renames in _ENUM_RENAMES:
        for old, new in renames:
            # ALTER TYPE ... RENAME VALUE is idempotent-safe: if the value
            # is already lowercase (fresh DB from corrected initial migration),
            # the rename of the uppercase value simply won't find anything.
            # We guard with a DO block to skip gracefully.
            op.execute(
                f"""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_enum
                        WHERE enumtypid = '{enum_name}'::regtype
                          AND enumlabel = '{old}'
                    ) THEN
                        ALTER TYPE {enum_name} RENAME VALUE '{old}' TO '{new}';
                    END IF;
                END
                $$;
                """
            )


def downgrade() -> None:
    for enum_name, renames in _ENUM_RENAMES:
        for old, new in renames:
            op.execute(
                f"""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_enum
                        WHERE enumtypid = '{enum_name}'::regtype
                          AND enumlabel = '{new}'
                    ) THEN
                        ALTER TYPE {enum_name} RENAME VALUE '{new}' TO '{old}';
                    END IF;
                END
                $$;
                """
            )
