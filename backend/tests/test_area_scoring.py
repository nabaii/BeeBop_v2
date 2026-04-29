"""GPS-cell snapping for area-infrastructure scores."""

from __future__ import annotations

import pytest

from app.inspector.area_scoring import CELL_PRECISION, snap_to_cell


def test_snap_to_cell_returns_lower_left_anchor() -> None:
    # 0.001° precision means 9.0765 -> 9.076.
    assert snap_to_cell(9.0765, 7.4985) == (9.076, 7.498)


def test_snap_truncates_rather_than_rounds() -> None:
    # 9.0769 must NOT round up to 9.077 — that would put a property in the
    # neighbour cell incorrectly.
    assert snap_to_cell(9.0769, 7.4999) == (9.076, 7.499)


def test_two_nearby_listings_share_a_cell() -> None:
    a = snap_to_cell(9.07650, 7.49850)
    b = snap_to_cell(9.07689, 7.49899)    # both inside the same 0.001° square
    assert a == b


def test_distinct_cells_do_not_collide() -> None:
    a = snap_to_cell(9.076, 7.498)
    b = snap_to_cell(9.077, 7.498)
    assert a != b


def test_precision_is_three_decimal_places() -> None:
    assert CELL_PRECISION == 3
