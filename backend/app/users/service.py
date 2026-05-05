"""User onboarding + profile business logic.

Each function is transactional at the route level (the session is opened by
the FastAPI `get_db` dependency and committed once the route handler
returns). Service code never calls commit — it only stages changes.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, ValidationError
from app.integrations.cac import get_cac_client
from app.integrations.nimc import verify_nin_with_retry
from app.models._enums import AccountType, Gender, ListingCategory, UserRole
from app.models.user import User
from app.users.schemas import (
    CacVerifyPayload,
    CacVerifyResponse,
    IdentityPayload,
    LandlordAccountTypePayload,
    NinDocumentRegisterPayload,
    NinDocumentRegisterResponse,
    NinVerifyPayload,
    NinVerifyResponse,
    ProfilePayload,
    SeekerCategoryPayload,
    StudentExtrasPayload,
    UserView,
)


def _view(user: User) -> UserView:
    onboarded = bool(user.first_name and user.last_name)
    if user.role == UserRole.LANDLORD and user.account_type is None:
        onboarded = False
    if user.role == UserRole.SEEKER and not user.category_preferences:
        onboarded = False
    return UserView(
        id=str(user.id),
        email=user.email,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        account_type=user.account_type,
        nin_verified=user.nin_verified,
        nin_document_url=user.nin_document_url,
        nin_document_uploaded_at=user.nin_document_uploaded_at,
        nin_review_note=user.nin_review_note,
        cac_verified=user.cac_verified,
        business_name=user.business_name,
        cac_number=user.cac_number,
        profile_photo_url=user.profile_photo_url,
        bio=user.bio,
        operating_area=user.operating_area,
        category_preferences=[
            ListingCategory(c) for c in (user.category_preferences or [])
        ]
        if user.category_preferences
        else None,
        institution=user.institution,
        academic_level=user.academic_level,
        gender=user.gender,
        onboarding_complete=onboarded,
    )


async def get_me(user: User) -> UserView:
    return _view(user)


async def set_identity(
    *, user: User, payload: IdentityPayload, db: AsyncSession
) -> UserView:
    user.first_name = payload.first_name.strip()
    user.last_name = payload.last_name.strip()
    # Email is only settable if the user registered via WhatsApp and has a
    # placeholder email. Trying to change an established email requires a
    # separate "change email" flow (not Sprint 1 scope).
    if payload.email:
        if user.email and not user.email.endswith("@beebop.ng"):
            raise ForbiddenError(
                "Email is already set. Use the change-email flow.",
                code="email_locked",
            )
        user.email = payload.email.lower()
    await db.flush()
    return _view(user)


async def set_seeker_categories(
    *, user: User, payload: SeekerCategoryPayload, db: AsyncSession
) -> UserView:
    if user.role != UserRole.SEEKER:
        raise ForbiddenError("Only seekers may set category preferences.")
    user.category_preferences = [c.value for c in payload.categories]
    await db.flush()
    return _view(user)


async def set_student_extras(
    *, user: User, payload: StudentExtrasPayload, db: AsyncSession
) -> UserView:
    if user.role != UserRole.SEEKER:
        raise ForbiddenError("Only seekers may set student details.")
    # A seeker is implicitly a student when off-campus is in their categories.
    categories = set(user.category_preferences or [])
    if ListingCategory.OFF_CAMPUS.value not in categories:
        raise ValidationError(
            "Student details are only collected when off-campus is selected.",
            code="student_details_not_applicable",
        )
    user.institution = payload.institution.strip()
    user.academic_level = payload.academic_level
    user.gender = Gender(payload.gender)
    await db.flush()
    return _view(user)


async def set_account_type(
    *, user: User, payload: LandlordAccountTypePayload, db: AsyncSession
) -> UserView:
    if user.role != UserRole.LANDLORD:
        raise ForbiddenError("Only landlords select an account type.")
    if user.account_type is not None and user.account_type != payload.account_type:
        raise ConflictError(
            "Account type already set. Contact support to change.",
            code="account_type_locked",
        )
    user.account_type = payload.account_type
    await db.flush()
    return _view(user)


async def verify_landlord_nin(
    *, user: User, payload: NinVerifyPayload, db: AsyncSession
) -> NinVerifyResponse:
    # NIN verification applies to: individual landlords, inspectors, and trusted
    # agents. Agencies (CAC), seekers, and admins do not run NIN through here.
    is_individual_landlord = (
        user.role == UserRole.LANDLORD and user.account_type == AccountType.INDIVIDUAL
    )
    is_internal_field_role = user.role in (UserRole.INSPECTOR, UserRole.TRUSTED_AGENT)
    if not (is_individual_landlord or is_internal_field_role):
        raise ForbiddenError(
            "NIN verification applies to individual landlords, inspectors, and trusted agents.",
            code="nin_not_applicable",
        )
    if user.nin_verified:
        return NinVerifyResponse(verified=True)

    result = await verify_nin_with_retry(payload.nin)
    # We never persist the raw NIN — only the verified flag per NDPR.
    if result.verified:
        user.nin_verified = True
        # If NIMC returned DOB we can persist it for landlord records.
        if result.date_of_birth:
            from datetime import date as _date

            try:
                user.date_of_birth = _date.fromisoformat(result.date_of_birth)
            except ValueError:
                pass
        await db.flush()
        return NinVerifyResponse(verified=True)

    # Failure path — timeout or not-found after retries. Admin review flag.
    return NinVerifyResponse(verified=False, admin_review=result.is_timeout)


async def register_nin_document(
    *, user: User, payload: NinDocumentRegisterPayload, db: AsyncSession
) -> NinDocumentRegisterResponse:
    """Manual NIN review path. The browser uploads an ID image to Cloudinary;
    this endpoint records the resulting URL on the user. Already-verified users
    do not need to re-upload.
    """
    is_individual_landlord = (
        user.role == UserRole.LANDLORD and user.account_type == AccountType.INDIVIDUAL
    )
    is_internal_field_role = user.role in (UserRole.INSPECTOR, UserRole.TRUSTED_AGENT)
    if not (is_individual_landlord or is_internal_field_role):
        raise ForbiddenError(
            "NIN verification applies to individual landlords, inspectors, and trusted agents.",
            code="nin_not_applicable",
        )
    if user.nin_verified:
        raise ConflictError(
            "NIN is already verified.", code="nin_already_verified"
        )
    user.nin_document_url = payload.url.strip()
    user.nin_document_uploaded_at = datetime.now(timezone.utc)
    # Clear any previous rejection note so the landlord sees a fresh submission.
    user.nin_review_note = None
    await db.flush()
    return NinDocumentRegisterResponse(
        nin_document_url=user.nin_document_url,
        nin_document_uploaded_at=user.nin_document_uploaded_at,
    )


async def verify_landlord_cac(
    *, user: User, payload: CacVerifyPayload, db: AsyncSession
) -> CacVerifyResponse:
    if user.role != UserRole.LANDLORD or user.account_type != AccountType.AGENCY:
        raise ForbiddenError(
            "CAC verification applies to agency landlords only.",
            code="cac_not_applicable",
        )
    if user.cac_verified:
        return CacVerifyResponse(verified=True)

    client = get_cac_client()
    result = await client.verify_cac(
        cac_number=payload.cac_number, business_name=payload.business_name
    )
    if result.verified:
        user.cac_verified = True
        user.cac_number = payload.cac_number
        user.business_name = result.business_name or payload.business_name
        user.operating_area = ", ".join(payload.agency_areas) or user.operating_area
        await db.flush()
        return CacVerifyResponse(verified=True)

    # Store provisional values even when pending so admin can see context.
    user.cac_number = payload.cac_number
    user.business_name = payload.business_name
    await db.flush()
    return CacVerifyResponse(verified=False, pending=result.is_pending)


async def set_profile(
    *, user: User, payload: ProfilePayload, db: AsyncSession
) -> UserView:
    if payload.profile_photo_url is not None:
        user.profile_photo_url = payload.profile_photo_url
    if payload.bio is not None:
        user.bio = payload.bio
    if payload.operating_area is not None:
        user.operating_area = payload.operating_area
    if payload.agency_logo_url is not None:
        if user.role != UserRole.LANDLORD or user.account_type != AccountType.AGENCY:
            raise ForbiddenError("Agency logo is only for agency landlords.")
        user.agency_logo_url = payload.agency_logo_url
    await db.flush()
    return _view(user)
