"""Listings routes — creation, draft editing, submission, photos, documents,
student inventory, short-let pricing."""

from __future__ import annotations

import time
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.integrations.cloudinary_storage import build_signed_upload_params
from app.integrations.s3_storage import get_storage
from app.listings import service, short_let, student_inventory
from app.listings.schemas import (
    AMENITY_GROUPS,
    DocumentRegisterPayload,
    DocumentUploadSignaturePayload,
    DocumentUploadSignatureResponse,
    ListingCreatePayload,
    ListingDeletePayload,
    ListingDraftPayload,
    ListingView,
    PhotoRegisterPayload,
    PhotoReorderPayload,
    PhotoUpdatePayload,
    PhotoUploadSignatureResponse,
    RoomPayload,
    RoomUpdatePayload,
    ShortLetPricingPayload,
    UnitTypePayload,
    UnitTypeView,
)
from app.models._enums import Gender
from app.models.user import User

router = APIRouter(prefix="/listings", tags=["listings"])


# -----------------------------------------------------------------------------
# Discovery of the amenity vocabulary
# -----------------------------------------------------------------------------


@router.get("/amenities")
async def get_amenity_vocabulary() -> dict[str, list[str]]:
    """Return the fixed amenity group/key map so the UI can render checkboxes
    without hard-coding the vocabulary."""
    return AMENITY_GROUPS


# -----------------------------------------------------------------------------
# Core CRUD
# -----------------------------------------------------------------------------


@router.post("", response_model=ListingView, status_code=status.HTTP_201_CREATED)
async def create(
    payload: ListingCreatePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListingView:
    view = await service.create_listing(user=user, category=payload.category, db=db)
    await db.commit()
    return view


@router.get("/mine", response_model=list[ListingView])
async def list_mine(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[ListingView]:
    return await service.list_my_listings(user=user, db=db)


@router.get("/{listing_id}", response_model=ListingView)
async def get_listing(
    listing_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListingView:
    return await service.get_listing_for_owner(user=user, listing_id=listing_id, db=db)


@router.patch("/{listing_id}", response_model=ListingView)
async def update_draft(
    listing_id: uuid.UUID,
    payload: ListingDraftPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListingView:
    view = await service.update_draft(
        user=user, listing_id=listing_id, payload=payload, db=db
    )
    await db.commit()
    return view


@router.post("/{listing_id}/submit", response_model=ListingView)
async def submit(
    listing_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListingView:
    view = await service.submit_listing(user=user, listing_id=listing_id, db=db)
    await db.commit()
    return view


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_listing(
    listing_id: uuid.UUID,
    payload: ListingDeletePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.delete_listing(user=user, listing_id=listing_id, payload=payload, db=db)
    await db.commit()



# -----------------------------------------------------------------------------
# Photos
# -----------------------------------------------------------------------------


@router.post("/{listing_id}/photos/signature", response_model=PhotoUploadSignatureResponse)
async def photo_upload_signature(
    listing_id: uuid.UUID,
    user: User = Depends(get_current_user),
) -> PhotoUploadSignatureResponse:
    sig = build_signed_upload_params(folder=f"listings/{listing_id}/photos")
    return PhotoUploadSignatureResponse(
        cloud_name=sig.cloud_name,
        api_key=sig.api_key,
        timestamp=sig.timestamp,
        signature=sig.signature,
        folder=sig.folder,
    )


@router.post("/{listing_id}/photos")
async def register_photo(
    listing_id: uuid.UUID,
    payload: PhotoRegisterPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    photo = await service.register_photo(
        user=user,
        listing_id=listing_id,
        url=payload.url,
        room_label=payload.room_label,
        db=db,
    )
    await db.commit()
    return {
        "id": str(photo.id),
        "url": photo.url,
        "room_label": photo.room_label,
        "is_cover": photo.is_cover,
        "display_order": photo.display_order,
    }


@router.patch("/{listing_id}/photos/{photo_id}")
async def update_photo(
    listing_id: uuid.UUID,
    photo_id: uuid.UUID,
    payload: PhotoUpdatePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    photo = await service.update_photo(
        user=user,
        listing_id=listing_id,
        photo_id=photo_id,
        room_label=payload.room_label,
        is_cover=payload.is_cover,
        db=db,
    )
    await db.commit()
    return {
        "id": str(photo.id),
        "url": photo.url,
        "room_label": photo.room_label,
        "is_cover": photo.is_cover,
        "display_order": photo.display_order,
    }


@router.delete("/{listing_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    listing_id: uuid.UUID,
    photo_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.delete_photo(user=user, listing_id=listing_id, photo_id=photo_id, db=db)
    await db.commit()


@router.post("/{listing_id}/photos/reorder")
async def reorder_photos(
    listing_id: uuid.UUID,
    payload: PhotoReorderPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    photos = await service.reorder_photos(
        user=user,
        listing_id=listing_id,
        ordered_ids=[uuid.UUID(pid) for pid in payload.photo_ids],
        db=db,
    )
    await db.commit()
    return [
        {
            "id": str(p.id),
            "url": p.url,
            "room_label": p.room_label,
            "is_cover": p.is_cover,
            "display_order": p.display_order,
        }
        for p in photos
    ]


# -----------------------------------------------------------------------------
# Documents (private S3)
# -----------------------------------------------------------------------------


@router.post(
    "/{listing_id}/documents/signature",
    response_model=DocumentUploadSignatureResponse,
)
async def document_upload_signature(
    listing_id: uuid.UUID,
    payload: DocumentUploadSignaturePayload,
    user: User = Depends(get_current_user),
) -> DocumentUploadSignatureResponse:
    # Key layout: listings/{id}/documents/{epoch}-{safe_filename}.
    safe = payload.filename.replace("/", "_").replace("\\", "_")
    key = f"listings/{listing_id}/documents/{int(time.time())}-{safe}"
    storage = get_storage()
    presigned = storage.presigned_put(key=key, content_type=payload.content_type)
    return DocumentUploadSignatureResponse(
        url=presigned.url,
        key=presigned.key,
        headers=presigned.headers,
    )


@router.post("/{listing_id}/documents")
async def register_document(
    listing_id: uuid.UUID,
    payload: DocumentRegisterPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await service.register_document(
        user=user,
        listing_id=listing_id,
        s3_key=payload.s3_key,
        filename=payload.filename,
        doc_type=payload.doc_type,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        db=db,
    )
    await db.commit()
    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "doc_type": doc.doc_type,
        "content_type": doc.content_type,
        "size_bytes": doc.size_bytes,
    }


@router.delete(
    "/{listing_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_document(
    listing_id: uuid.UUID,
    document_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.delete_document(
        user=user, listing_id=listing_id, document_id=document_id, db=db
    )
    await db.commit()


# -----------------------------------------------------------------------------
# Student inventory
# -----------------------------------------------------------------------------


def _unit_view(ut) -> UnitTypeView:  # type: ignore[no-untyped-def]
    return UnitTypeView(
        id=str(ut.id),
        name=ut.name,
        kind=ut.kind,
        beds_per_room=ut.beds_per_room,
        total_units=ut.total_units,
        price=float(ut.price),
        rooms=[
            {
                "id": str(r.id),
                "name": r.name,
                "gender_tag": r.gender_tag,
                "beds_total": r.beds_total,
                "beds_available": r.beds_available,
                "amenities": r.amenities or [],
            }
            for r in getattr(ut, "rooms", []) or []
        ],
    )


@router.get("/{listing_id}/unit-types", response_model=list[UnitTypeView])
async def list_units(
    listing_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UnitTypeView]:
    units = await student_inventory.list_unit_types(
        user=user, listing_id=listing_id, db=db
    )
    return [_unit_view(u) for u in units]


@router.post(
    "/{listing_id}/unit-types",
    response_model=UnitTypeView,
    status_code=status.HTTP_201_CREATED,
)
async def add_unit(
    listing_id: uuid.UUID,
    payload: UnitTypePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnitTypeView:
    ut = await student_inventory.add_unit_type(
        user=user, listing_id=listing_id, payload=payload, db=db
    )
    await db.commit()
    return _unit_view(ut)


@router.post(
    "/{listing_id}/unit-types/{unit_type_id}/rooms",
    status_code=status.HTTP_201_CREATED,
)
async def add_room(
    listing_id: uuid.UUID,
    unit_type_id: uuid.UUID,
    payload: RoomPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    room = await student_inventory.add_room(
        user=user,
        listing_id=listing_id,
        unit_type_id=unit_type_id,
        payload=payload,
        db=db,
    )
    await db.commit()
    return {
        "id": str(room.id),
        "name": room.name,
        "gender_tag": room.gender_tag,
        "beds_total": room.beds_total,
        "beds_available": room.beds_available,
        "amenities": room.amenities,
    }


@router.patch(
    "/{listing_id}/unit-types/{unit_type_id}/rooms/{room_id}"
)
async def update_room(
    listing_id: uuid.UUID,
    unit_type_id: uuid.UUID,
    room_id: uuid.UUID,
    payload: RoomUpdatePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    room = await student_inventory.update_room(
        user=user,
        listing_id=listing_id,
        unit_type_id=unit_type_id,
        room_id=room_id,
        payload=payload,
        db=db,
    )
    await db.commit()
    return {
        "id": str(room.id),
        "name": room.name,
        "gender_tag": room.gender_tag,
        "beds_total": room.beds_total,
        "beds_available": room.beds_available,
        "amenities": room.amenities,
    }


@router.delete(
    "/{listing_id}/unit-types/{unit_type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_unit(
    listing_id: uuid.UUID,
    unit_type_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await student_inventory.delete_unit_type(
        user=user, listing_id=listing_id, unit_type_id=unit_type_id, db=db
    )
    await db.commit()


# -----------------------------------------------------------------------------
# Short-let pricing
# -----------------------------------------------------------------------------


@router.patch("/{listing_id}/short-let-pricing", response_model=ListingView)
async def set_short_let_pricing(
    listing_id: uuid.UUID,
    payload: ShortLetPricingPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListingView:
    await short_let.set_short_let_pricing(
        user=user, listing_id=listing_id, payload=payload, db=db
    )
    await db.commit()
    return await service.get_listing_for_owner(user=user, listing_id=listing_id, db=db)
