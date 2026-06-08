"""User profile and onboarding routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.integrations.cloudinary_storage import build_signed_upload_params
from app.models.user import User
from app.users import service
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
    SeekerExtrasPayload,
    StudentExtrasPayload,
    UserView,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserView)
async def me(user: User = Depends(get_current_user)) -> UserView:
    return await service.get_me(user)


@router.patch("/me/identity", response_model=UserView)
async def set_identity(
    payload: IdentityPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserView:
    view = await service.set_identity(user=user, payload=payload, db=db)
    await db.commit()
    return view


@router.patch("/me/seeker-categories", response_model=UserView)
async def set_seeker_categories(
    payload: SeekerCategoryPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserView:
    view = await service.set_seeker_categories(user=user, payload=payload, db=db)
    await db.commit()
    return view


@router.patch("/me/student-extras", response_model=UserView)
async def set_student_extras(
    payload: StudentExtrasPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserView:
    view = await service.set_student_extras(user=user, payload=payload, db=db)
    await db.commit()
    return view


@router.patch("/me/seeker-extras", response_model=UserView)
async def set_seeker_extras(
    payload: SeekerExtrasPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserView:
    view = await service.set_seeker_extras(user=user, payload=payload, db=db)
    await db.commit()
    return view


@router.post("/me/become-landlord", response_model=UserView)
async def become_landlord(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserView:
    view = await service.become_landlord(user=user, db=db)
    await db.commit()
    return view


@router.patch("/me/account-type", response_model=UserView)
async def set_account_type(
    payload: LandlordAccountTypePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserView:
    view = await service.set_account_type(user=user, payload=payload, db=db)
    await db.commit()
    return view


@router.post("/me/verify-nin", response_model=NinVerifyResponse)
async def verify_nin(
    payload: NinVerifyPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NinVerifyResponse:
    result = await service.verify_landlord_nin(user=user, payload=payload, db=db)
    await db.commit()
    return result


@router.post("/me/nin-document/signature")
async def nin_document_upload_signature(
    user: User = Depends(get_current_user),
) -> dict[str, str | int]:
    """Cloudinary signed upload payload for a NIN ID image. The browser uploads
    directly to Cloudinary and then calls POST /me/nin-document with the URL.
    """
    sig = build_signed_upload_params(folder=f"users/{user.id}/nin")
    return {
        "cloud_name": sig.cloud_name,
        "api_key": sig.api_key,
        "timestamp": sig.timestamp,
        "signature": sig.signature,
        "folder": sig.folder,
    }


@router.post("/me/nin-document", response_model=NinDocumentRegisterResponse)
async def register_nin_document(
    payload: NinDocumentRegisterPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NinDocumentRegisterResponse:
    result = await service.register_nin_document(user=user, payload=payload, db=db)
    await db.commit()
    return result


@router.post("/me/verify-cac", response_model=CacVerifyResponse)
async def verify_cac(
    payload: CacVerifyPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CacVerifyResponse:
    result = await service.verify_landlord_cac(user=user, payload=payload, db=db)
    await db.commit()
    return result


@router.patch("/me/profile", response_model=UserView)
async def set_profile(
    payload: ProfilePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserView:
    view = await service.set_profile(user=user, payload=payload, db=db)
    await db.commit()
    return view


@router.post("/me/photo-upload")
async def photo_upload_signature(
    user: User = Depends(get_current_user),
) -> dict[str, str | int]:
    """Cloudinary signed upload payload for a profile photo."""
    sig = build_signed_upload_params(folder=f"users/{user.id}/profile")
    return {
        "cloud_name": sig.cloud_name,
        "api_key": sig.api_key,
        "timestamp": sig.timestamp,
        "signature": sig.signature,
        "folder": sig.folder,
    }
