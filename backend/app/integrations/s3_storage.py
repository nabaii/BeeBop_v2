"""S3-compatible presigned URL generation for documents and inspector evidence.

For MVP we target AWS S3 for documents (Cloudinary handles listing photos).
The live implementation uses boto3; the dev stub returns a fake URL so the
upload flow can be exercised locally without credentials.

Presigned PUT lifetime: 5 minutes. Short enough that leaked URLs are useless;
long enough for a large agreement PDF to upload on a 3G connection.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import quote

from app.config import get_settings
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)
settings = get_settings()

DEFAULT_PUT_EXPIRY = 5 * 60
DEFAULT_GET_EXPIRY = 15 * 60


@dataclass
class PresignedUpload:
    url: str
    key: str
    headers: dict[str, str]


class ObjectStorage(Protocol):
    def presigned_put(
        self,
        *,
        key: str,
        content_type: str,
        expiry_seconds: int = DEFAULT_PUT_EXPIRY,
    ) -> PresignedUpload: ...

    def presigned_get(self, *, key: str, expiry_seconds: int = DEFAULT_GET_EXPIRY) -> str: ...


class BotoS3Storage:
    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        access_key_id: str,
        secret_access_key: str,
    ) -> None:
        import boto3

        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )

    def presigned_put(
        self,
        *,
        key: str,
        content_type: str,
        expiry_seconds: int = DEFAULT_PUT_EXPIRY,
    ) -> PresignedUpload:
        url = self._client.generate_presigned_url(
            ClientMethod="put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expiry_seconds,
            HttpMethod="PUT",
        )
        return PresignedUpload(
            url=str(url),
            key=key,
            headers={"Content-Type": content_type},
        )

    def presigned_get(
        self, *, key: str, expiry_seconds: int = DEFAULT_GET_EXPIRY
    ) -> str:
        url = self._client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expiry_seconds,
        )
        return str(url)


class StubObjectStorage:
    """Dev stub. Generates unreachable `https://stub.local/...` URLs. The
    frontend's upload layer recognises `stub.local` and short-circuits to a
    synthetic success for demo purposes.
    """

    def presigned_put(
        self,
        *,
        key: str,
        content_type: str,
        expiry_seconds: int = DEFAULT_PUT_EXPIRY,
    ) -> PresignedUpload:
        safe = quote(key, safe="/")
        return PresignedUpload(
            url=f"https://stub.local/put/{safe}",
            key=key,
            headers={"Content-Type": content_type},
        )

    def presigned_get(
        self, *, key: str, expiry_seconds: int = DEFAULT_GET_EXPIRY
    ) -> str:
        safe = quote(key, safe="/")
        return f"https://stub.local/get/{safe}?expires={expiry_seconds}"


def get_storage() -> ObjectStorage:
    if (
        settings.s3_bucket
        and settings.s3_access_key_id
        and settings.s3_secret_access_key
    ):
        return BotoS3Storage(
            bucket=settings.s3_bucket,
            region=settings.s3_region,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
        )
    if settings.environment != "development":
        raise ExternalServiceError(
            "S3 credentials must be set outside development.",
            code="s3_unconfigured",
        )
    return StubObjectStorage()
