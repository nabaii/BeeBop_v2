"""Pydantic schemas for the referral endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models._enums import ReferralCodeStatus, ReferralTier


class MyCodeView(BaseModel):
    """The signed-in user's own code + shareable link (§6.1)."""

    code: str
    share_link: str
    tier: ReferralTier
    status: ReferralCodeStatus


class ApplyCodePayload(BaseModel):
    agreement_id: uuid.UUID
    code: str = Field(..., min_length=1, max_length=32)


class AttributionView(BaseModel):
    """The code (if any) written onto an agreement, and whether it is sealed."""

    agreement_id: str
    code: str
    applied_at: datetime
    sealed: bool
