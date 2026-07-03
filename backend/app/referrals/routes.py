"""Referral endpoints — the user's own code, applying a code at checkout, the
user-facing dashboard (§6) and payouts (§7).

The admin management view (§11) lands in a later sprint.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import audit
from app.config import get_settings
from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models._enums import UserRole
from app.models.referral import ReferralPartnerApplication
from app.models.user import User
from app.referrals import admin as admin_service
from app.referrals import payouts, service
from app.referrals.codes import get_or_create_code
from app.referrals.schemas import (
    ActivityItemView,
    AdminApplicationView,
    AdminCodeView,
    AdminOverviewView,
    AdminPayoutView,
    ApplyCodePayload,
    AttributionView,
    BalancesView,
    BankOptionView,
    CashbackItemView,
    ConfigUpdatePayload,
    ConfigView,
    DashboardView,
    MyCodeView,
    PartnerApplicationPayload,
    PartnerApplicationView,
    PayoutView,
    RejectPayload,
    ResolveAccountPayload,
    ResolvedAccountView,
    SetTierPayload,
    WithdrawPayload,
)

router = APIRouter(prefix="/referrals", tags=["referrals"])
settings = get_settings()


def _share_link(code: str) -> str:
    return f"{settings.public_web_base_url.rstrip('/')}/r/{code}"


def _payout_view(payout) -> PayoutView:  # type: ignore[no-untyped-def]
    return PayoutView(
        id=str(payout.id),
        amount=float(payout.amount),
        status=payout.status,
        bank_account_number=payout.bank_account_number,
        failure_reason=payout.failure_reason,
        created_at=payout.created_at,
        settled_at=payout.settled_at,
    )


@router.get("/me/code", response_model=MyCodeView)
async def my_code(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> MyCodeView:
    """The signed-in user's referral code + share link. Issues one lazily for
    any pre-existing account that predates auto-issuance."""
    code = await get_or_create_code(user=user, db=db)
    await db.commit()
    return MyCodeView(
        code=code.code,
        share_link=_share_link(code.code),
        tier=code.tier,
        status=code.status,
    )


@router.post("/apply", response_model=AttributionView)
async def apply_code(
    payload: ApplyCodePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttributionView:
    """Path B — attach a referral code to the seeker's transaction at checkout."""
    attribution = await service.apply_referral_code(
        seeker=user,
        agreement_id=payload.agreement_id,
        raw_code=payload.code,
        db=db,
    )
    await db.commit()
    return AttributionView(
        agreement_id=str(attribution.agreement_id),
        code=attribution.code,
        applied_at=attribution.applied_at,
        sealed=attribution.sealed_at is not None,
    )


@router.get("/agreement/{agreement_id}", response_model=AttributionView | None)
async def agreement_attribution(
    agreement_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttributionView | None:
    """The code currently written onto an agreement, or null. Used by the
    checkout UI to show the applied/locked state."""
    attribution = await service._existing_attribution(agreement_id=agreement_id, db=db)
    if attribution is None:
        return None
    return AttributionView(
        agreement_id=str(attribution.agreement_id),
        code=attribution.code,
        applied_at=attribution.applied_at,
        sealed=attribution.sealed_at is not None,
    )


@router.get("/me/dashboard", response_model=DashboardView)
async def my_dashboard(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> DashboardView:
    """Everything the Referrals dashboard renders (§6): code + link, balances,
    activity feed, cashback, and whether a withdrawal is currently allowed."""
    code = await get_or_create_code(user=user, db=db)
    balances = await service.get_balances(user_id=user.id, db=db)
    activity = await service.get_activity(user_id=user.id, db=db)
    cashback = await service.get_cashback(user_id=user.id, db=db)
    config = await service.get_config(db)
    await db.commit()

    minimum = int(config.min_withdrawal_naira)
    return DashboardView(
        code=code.code,
        share_link=_share_link(code.code),
        tier=code.tier,
        status=code.status,
        balances=BalancesView(
            total_earned=balances.total_earned,
            available=balances.available,
            pending=balances.pending,
            paid=balances.paid,
        ),
        activity=[
            ActivityItemView(label=a.label, state=a.state, amount=a.amount, at=a.at)
            for a in activity
        ],
        cashback=[
            CashbackItemView(
                amount=c.amount, state=c.state, clears_at=c.clears_at, at=c.at
            )
            for c in cashback
        ],
        min_withdrawal=minimum,
        can_withdraw=balances.available >= minimum,
    )


@router.get("/banks", response_model=list[BankOptionView])
async def list_banks(
    user: User = Depends(get_current_user),
) -> list[BankOptionView]:
    """Payout-eligible banks for the withdrawal picker (§7.1)."""
    banks = await payouts.list_banks()
    return [BankOptionView(name=b.name, code=b.code) for b in banks]


@router.post("/resolve-account", response_model=ResolvedAccountView)
async def resolve_account(
    payload: ResolveAccountPayload,
    user: User = Depends(get_current_user),
) -> ResolvedAccountView:
    """Verify a bank account and return the holder's name so the user can
    confirm it before withdrawing (§7.1)."""
    resolved = await payouts.resolve_account(
        account_number=payload.account_number, bank_code=payload.bank_code
    )
    return ResolvedAccountView(
        account_number=resolved.account_number,
        account_name=resolved.account_name,
    )


@router.post("/payouts", response_model=PayoutView)
async def request_payout(
    payload: WithdrawPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutView:
    """Withdraw the user's available balance via Paystack Transfer (§7.1).

    A returned payout with status `failed` is a normal outcome — the balance is
    untouched and the user can retry."""
    payout = await payouts.request_withdrawal(
        user=user,
        bank_account_number=payload.bank_account_number,
        bank_code=payload.bank_code,
        account_name=payload.account_name,
        db=db,
    )
    await db.commit()
    return _payout_view(payout)


@router.get("/payouts", response_model=list[PayoutView])
async def payout_history(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[PayoutView]:
    """The user's payout history, most recent first (§7.2)."""
    rows = await payouts.list_payouts(user_id=user.id, db=db)
    return [_payout_view(p) for p in rows]


# ---------------------------------------------------------------------------
# Campus-partner application (§2.2) — user side
# ---------------------------------------------------------------------------


def _application_view(a: ReferralPartnerApplication) -> PartnerApplicationView:
    return PartnerApplicationView(
        id=str(a.id),
        status=a.status,
        institution=a.institution,
        position=a.position,
        review_note=a.review_note,
        created_at=a.created_at,
        reviewed_at=a.reviewed_at,
    )


@router.post("/partner-application", response_model=PartnerApplicationView)
async def apply_partner(
    payload: PartnerApplicationPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PartnerApplicationView:
    application = await service.apply_for_partner(
        user=user,
        full_name=payload.full_name,
        institution=payload.institution,
        position=payload.position,
        promo_plan=payload.promo_plan,
        contact_phone=payload.contact_phone,
        contact_email=payload.contact_email,
        payout_bank_code=payload.payout_bank_code,
        payout_account_number=payload.payout_account_number,
        db=db,
    )
    await db.commit()
    return _application_view(application)


@router.get("/partner-application", response_model=PartnerApplicationView | None)
async def my_partner_application(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> PartnerApplicationView | None:
    application = await service.my_partner_application(user_id=user.id, db=db)
    return _application_view(application) if application else None


# ---------------------------------------------------------------------------
# Admin management view (§11)
# ---------------------------------------------------------------------------

admin_router = APIRouter(
    prefix="/internal/admin/referrals",
    tags=["admin", "referrals"],
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)


def _admin_application_view(a: ReferralPartnerApplication) -> AdminApplicationView:
    return AdminApplicationView(
        id=str(a.id),
        user_id=str(a.user_id),
        full_name=a.full_name,
        institution=a.institution,
        position=a.position,
        promo_plan=a.promo_plan,
        contact_phone=a.contact_phone,
        contact_email=a.contact_email,
        status=a.status,
        review_note=a.review_note,
        created_at=a.created_at,
        reviewed_at=a.reviewed_at,
    )


def _config_view(c) -> ConfigView:  # type: ignore[no-untyped-def]
    return ConfigView(
        first_time_purchaser_required=c.first_time_purchaser_required,
        per_code_semester_cap=c.per_code_semester_cap,
        clearing_window_days=c.clearing_window_days,
        min_withdrawal_naira=c.min_withdrawal_naira,
        reward_pool_pct=float(c.reward_pool_pct),
        referrer_share=float(c.referrer_share),
        payer_cashback_share=float(c.payer_cashback_share),
        partner_tier1_share=float(c.partner_tier1_share),
        partner_tier2_share=float(c.partner_tier2_share),
        partner_tier3_share=float(c.partner_tier3_share),
        partner_tier1_max=c.partner_tier1_max,
        partner_tier2_max=c.partner_tier2_max,
    )


@admin_router.get("/overview", response_model=AdminOverviewView)
async def admin_overview(db: AsyncSession = Depends(get_db)) -> AdminOverviewView:
    return AdminOverviewView(**await admin_service.overview(db))


@admin_router.get("/codes", response_model=list[AdminCodeView])
async def admin_codes(db: AsyncSession = Depends(get_db)) -> list[AdminCodeView]:
    return [AdminCodeView(**c) for c in await admin_service.list_codes(db)]


@admin_router.post("/codes/{code_id}/suspend")
async def admin_suspend_code(
    code_id: uuid.UUID,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    code = await admin_service.set_code_status(
        admin=admin, code_id=code_id, suspend=True, db=db
    )
    await db.commit()
    return {"status": code.status.value}


@admin_router.post("/codes/{code_id}/reactivate")
async def admin_reactivate_code(
    code_id: uuid.UUID,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    code = await admin_service.set_code_status(
        admin=admin, code_id=code_id, suspend=False, db=db
    )
    await db.commit()
    return {"status": code.status.value}


@admin_router.post("/codes/{code_id}/tier")
async def admin_set_tier(
    code_id: uuid.UUID,
    payload: SetTierPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    code = await admin_service.set_code_tier(
        admin=admin, code_id=code_id, tier=payload.tier, db=db
    )
    await db.commit()
    return {"tier": code.tier.value}


@admin_router.get("/applications", response_model=list[AdminApplicationView])
async def admin_applications(
    db: AsyncSession = Depends(get_db),
) -> list[AdminApplicationView]:
    return [_admin_application_view(a) for a in await admin_service.list_applications(db)]


@admin_router.post(
    "/applications/{application_id}/approve", response_model=AdminApplicationView
)
async def admin_approve_application(
    application_id: uuid.UUID,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> AdminApplicationView:
    application = await admin_service.approve_application(
        admin=admin, application_id=application_id, db=db
    )
    await db.commit()
    return _admin_application_view(application)


@admin_router.post(
    "/applications/{application_id}/reject", response_model=AdminApplicationView
)
async def admin_reject_application(
    application_id: uuid.UUID,
    payload: RejectPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> AdminApplicationView:
    application = await admin_service.reject_application(
        admin=admin, application_id=application_id, note=payload.note, db=db
    )
    await db.commit()
    return _admin_application_view(application)


@admin_router.get("/config", response_model=ConfigView)
async def admin_get_config(db: AsyncSession = Depends(get_db)) -> ConfigView:
    return _config_view(await service.get_config(db))


@admin_router.patch("/config", response_model=ConfigView)
async def admin_update_config(
    payload: ConfigUpdatePayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> ConfigView:
    config = await admin_service.update_config(
        admin=admin, changes=payload.model_dump(exclude_none=True), db=db
    )
    await db.commit()
    return _config_view(config)


@admin_router.get("/payouts", response_model=list[AdminPayoutView])
async def admin_payouts(db: AsyncSession = Depends(get_db)) -> list[AdminPayoutView]:
    rows = await admin_service.list_all_payouts(db)
    return [
        AdminPayoutView(
            id=str(p.id),
            user_id=str(p.user_id),
            amount=float(p.amount),
            status=p.status,
            bank_account_name=p.bank_account_name,
            failure_reason=p.failure_reason,
            created_at=p.created_at,
            settled_at=p.settled_at,
        )
        for p in rows
    ]


@admin_router.post("/earnings/{earning_id}/reverse")
async def admin_reverse_earning(
    earning_id: uuid.UUID,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    earning = await service.reverse_earning(earning_id=earning_id, db=db)
    await audit.record(
        admin_id=admin.id,
        entity_type="referral_earning",
        entity_id=earning.id,
        action="reverse",
        payload={"amount": float(earning.amount)},
        db=db,
    )
    await db.commit()
    return {"state": earning.state.value}
