"""Cloudinary presigned upload — used for profile photos and listing images.

For MVP we use Cloudinary's signed upload URL pattern: the server issues a
signature, the browser uploads directly to Cloudinary. S3 is used separately
for documents and inspector evidence where we need strict privacy controls.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from app.config import get_settings
from app.core.exceptions import ExternalServiceError

settings = get_settings()


@dataclass
class CloudinarySignature:
    cloud_name: str
    api_key: str
    timestamp: int
    signature: str
    folder: str


def build_signed_upload_params(folder: str) -> CloudinarySignature:
    """Produce a signed upload payload. Requires CLOUDINARY_* env vars set.

    The browser posts:
      - file
      - api_key
      - timestamp
      - signature
      - folder
    to https://api.cloudinary.com/v1_1/{cloud_name}/image/upload

    The actual signature computation uses Cloudinary's helper in the live
    integration (added in Sprint 2). For Sprint 1 we only need the shape for
    the profile-photo step, and the frontend imports a single client.
    """
    if not (
        settings.cloudinary_cloud_name
        and settings.cloudinary_api_key
        and settings.cloudinary_api_secret
    ):
        if settings.environment != "development":
            raise ExternalServiceError(
                "Cloudinary credentials required outside development.",
                code="cloudinary_unconfigured",
            )
        # Dev stub — front-end will short-circuit and save a placeholder URL.
        return CloudinarySignature(
            cloud_name="stub", api_key="stub", timestamp=int(time.time()),
            signature="stub", folder=folder,
        )

    import cloudinary
    import cloudinary.utils

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
    )
    timestamp = int(time.time())
    params_to_sign = {"timestamp": timestamp, "folder": folder}
    signature = cloudinary.utils.api_sign_request(
        params_to_sign, settings.cloudinary_api_secret
    )
    return CloudinarySignature(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        timestamp=timestamp,
        signature=signature,
        folder=folder,
    )
