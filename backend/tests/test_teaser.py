"""
Tests for `app.services.teaser.compute_teaser`.

Pure function — no DB, no fixtures. Verifies the guard order specified in
`docs/designs/interaction-first-landing.md` § "Teaser safety filter":
language → tokens → stem → min length → allowlist → blocklist veto →
distinct-entry threshold → tiebreak.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services.teaser import compute_teaser


def test_repeats_across_two_transcripts_returns_stem():
    # "focused" and "focusing" both Porter-stem to "focus".
    out = compute_teaser(
        ["I was really focused on the work today.",
         "Spent the morning focusing on shipping."],
        language="en",
    )
    assert out == "focus"


def test_repeated_in_one_transcript_only_returns_none():
    # Same stem repeating inside a single entry contributes only 1 to the
    # distinct-entry counter — needs >=2 different entries to qualify.
    out = compute_teaser(
        ["focus focus focus focus focus"],
        language="en",
    )
    assert out is None


def test_blocklist_short_circuits_qualifying_stem():
    # "Mark" stems to "mark" and is on the first-name blocklist. Even
    # though it qualifies (count=2), the blocklist veto returns None for
    # the whole call so we never surface a near-name.
    out = compute_teaser(
        ["Mark called this morning.",
         "Mark sent the deck."],
        language="en",
    )
    assert out is None


def test_stem_not_on_allowlist_returns_none():
    # Made-up word — stems to itself, repeats, but isn't an allowlisted
    # lemma. Must be filtered out.
    out = compute_teaser(
        ["The flibbermount glittered.",
         "Another flibbermount glittered."],
        language="en",
    )
    assert out is None


def test_stem_below_min_length_returns_none():
    # "go" stems to "go" (length 2 < 4) — even though it would otherwise
    # qualify, the min-length filter drops it before allowlist check.
    out = compute_teaser(
        ["I had to go to the store.",
         "I might go again tomorrow."],
        language="en",
    )
    assert out is None


def test_non_english_language_returns_none():
    # Spanish input — explicit short-circuit. We deliberately don't even
    # try to detect a language-agnostic teaser; v1 is English-only.
    out = compute_teaser(
        ["Estaba enfocado en el trabajo hoy.",
         "Pasé la mañana enfocándome en enviar."],
        language="es",
    )
    assert out is None


def test_language_none_treated_as_english():
    # Whisper sometimes can't determine language — None should NOT block.
    out = compute_teaser(
        ["Focused on the meeting all day.",
         "Another meeting and I'm focusing again."],
        language=None,
    )
    # Either "focus" or "meet" qualifies — both stems should be allow-listed.
    # The deterministic tiebreak is "focus" alphabetically vs "meet": same
    # distinct count (2), same total (2). Alphabetical → "focus".
    assert out == "focus"


def test_empty_input_returns_none():
    assert compute_teaser([], language="en") is None
    assert compute_teaser(["", ""], language="en") is None
    assert compute_teaser([None, None], language="en") is None  # type: ignore[list-item]


def test_tiebreak_prefers_higher_distinct_count():
    """3 distinct entries beats 2 distinct entries even with a smaller
    total occurrence count. (Distinct count is the primary sort key.)"""
    out = compute_teaser(
        [
            "I had a meeting today.",
            "Another meeting tomorrow.",
            "And one more meeting on Friday.",
            # Two entries with "focus" (one of them repeats it 5 times).
            "Focused focused focused focused focused.",
            "Focused on shipping.",
        ],
        language="en",
    )
    # "meet" has distinct=3, total=3.
    # "focus" has distinct=2, total=6.
    # Distinct count wins → "meet".
    assert out == "meet"


def test_tiebreak_alphabetical_when_all_else_equal():
    """When two stems have the same distinct count and same total
    occurrences, the alphabetically smaller stem wins. Documented
    deterministic rule so a teaser doesn't flicker across runs."""
    out = compute_teaser(
        [
            "Coffee and breakfast.",
            "Coffee and breakfast.",
        ],
        language="en",
    )
    # Both "coffe" and "breakfast" stem to allowlisted entries; same
    # distinct=2, same total=2. Alphabetical → "breakfast" before "coffe".
    assert out == "breakfast"


def test_stopwords_dropped_before_stemming():
    """Stopwords like 'the', 'a', 'and' must never become a teaser even
    if they repeat across many entries."""
    out = compute_teaser(
        ["The the the and the.", "And the and and."],
        language="en",
    )
    assert out is None
