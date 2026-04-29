"""Celery application — Redis broker + result backend.

Run a worker with:

    celery -A app.notifications.celery_app worker --loglevel=info

Run Beat (scheduled tasks like offer-expiry timers, Sprint 8) with:

    celery -A app.notifications.celery_app beat --loglevel=info

Worker health is monitored via Flower in production:

    celery -A app.notifications.celery_app flower --port=5555
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "beebop",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.notifications.tasks",
        "app.offers.sweeper",
        "app.agreements.renewal",
        "app.bookings.sweeper",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Africa/Lagos",
    enable_utc=True,
    # Broker fault tolerance.
    broker_connection_retry_on_startup=True,
    # Reasonable retry defaults — per-task overrides where stronger guarantees
    # are needed (e.g. payment webhooks).
    task_default_retry_delay=60,
    task_default_max_retries=3,
)

# Beat schedule.
celery_app.conf.beat_schedule = {
    "broker-liveness-check": {
        "task": "app.notifications.tasks.broker_liveness",
        "schedule": crontab(minute=0, hour=0),       # daily at 00:00
    },
    # Sprint 8 — offer-expiry sweeper. Fires every minute. The task itself
    # is idempotent (per-bucket flags on Offer.expiry_notifications_sent) so
    # high cadence doesn't risk double notifications.
    "offer-expiry-sweeper": {
        "task": "app.offers.sweeper.process_offer_expiry",
        "schedule": crontab(minute="*"),
    },
    # Sprint 10 — renewal prompts at 30 days before tenancy expiry. Daily.
    "agreement-renewal-sweeper": {
        "task": "app.agreements.renewal.run_renewal_sweeper",
        "schedule": crontab(minute=30, hour=9),       # 09:30 Africa/Lagos
    },
    # Sprint 11 — release access details on check-in day. Hourly so the
    # window for delivery covers any time zone shift.
    "booking-access-details-release": {
        "task": "app.bookings.sweeper.release_due_access_details",
        "schedule": crontab(minute=0),
    },
    # Sprint 11 — auto-decline non-instant bookings past their 24h window.
    "booking-auto-decline": {
        "task": "app.bookings.sweeper.auto_decline_stale_requests",
        "schedule": crontab(minute="*/30"),
    },
}
