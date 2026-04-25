"""
Teaser computation — surfaces a single repeating word across a demo
session's transcripts to seed the post-signup nudge ("you talked about
'focus' twice").

Design constraints (from `docs/designs/interaction-first-landing.md`,
"Teaser safety filter (Codex P2 #11)"):

  - Pure function, no DB, no I/O.
  - English only — `language != 'en'` short-circuits to None.
  - Min stem length 4 (drops "go", "do", "the", etc.).
  - Allowlist gate: stem must appear in `teaser_allowlist.txt`. Anything
    novel is filtered out — we'd rather miss a teaser than ship "you
    talked about 'irrelev' twice".
  - Blocklist veto: profanity + first-name stems short-circuit to None
    even if otherwise qualifying. The blocklist returns None for the
    whole session if any qualifying stem is on it (defensive — we'd
    rather no teaser than a blocked one).
  - Distinct-entry count: a stem must appear in >=2 different transcripts
    to qualify. Frequency within a single transcript does NOT count
    toward the threshold.

Tiebreak:
  1. Highest distinct-entry count.
  2. Highest total occurrences across all transcripts.
  3. Lexicographic (alphabetical) — for determinism.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Optional

from . import _porter

_MIN_STEM_LEN = 4

# Compact stopword list (~50). Avoid pulling NLTK or a corpus file just for
# this — these are the bare-minimum words that would otherwise dominate
# every transcript.
_STOPWORDS: frozenset[str] = frozenset(
    """
    a about above after again all am an and any are aren as at
    be because been before being below between both but by
    can cant could couldnt did didnt do does doesnt doing dont down during
    each few for from further
    had hadnt has hasnt have havent having he her here hers herself
    him himself his how
    i if in into is isnt it its itself
    just
    me more most my myself
    no nor not now
    of off on once only or other our ours ourselves out over own
    same she should shouldnt so some such
    than that the their theirs them themselves then there these they this those through to too
    under until up very
    was wasnt we were werent what when where which while who whom why with wont would wouldnt
    you your yours yourself yourselves
    youre youll youve youd
    im ive id ill
    """.split()
)

_TOKEN_RE = re.compile(r"[a-z]+")


@lru_cache(maxsize=1)
def _load_allowlist() -> frozenset[str]:
    return _read_wordlist("teaser_allowlist.txt")


@lru_cache(maxsize=1)
def _load_blocklist() -> frozenset[str]:
    return _read_wordlist("teaser_blocklist.txt")


def _read_wordlist(name: str) -> frozenset[str]:
    path = Path(__file__).parent / name
    out: set[str] = set()
    with path.open("r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            out.add(line.lower())
    return frozenset(out)


def _tokens(text: str) -> Iterable[str]:
    """Lowercase ASCII word tokens. Drops stopwords and punctuation."""
    for tok in _TOKEN_RE.findall(text.lower()):
        if tok not in _STOPWORDS:
            yield tok


def compute_teaser(
    transcripts: list[str], language: Optional[str]
) -> Optional[str]:
    """
    Return the highest-scoring repeating stem, or None if no qualifying
    candidate exists.

    Guard order (must match the spec):
      1. Language guard (return None for non-English).
      2. Token clean / stopword drop / Porter stem.
      3. Min length 4.
      4. Allowlist gate.
      5. Blocklist veto (returns None for the whole call if any stem on
         the blocklist would have qualified).
      6. Distinct-entry count >= 2.
      7. Tiebreak.
    """
    # 1. Language guard.
    if language is not None and language != "en":
        return None

    if not transcripts:
        return None

    allowlist = _load_allowlist()
    blocklist = _load_blocklist()

    # Per-stem aggregates: distinct-entry count + total occurrences.
    distinct_entries: dict[str, int] = {}
    total_count: dict[str, int] = {}

    for transcript in transcripts:
        if not transcript:
            continue
        # Track distinct stems within this single transcript so we count
        # "distinct entries" correctly (a stem repeating inside one entry
        # only contributes 1 to the distinct-entry counter).
        seen_in_this_entry: set[str] = set()
        for tok in _tokens(transcript):
            stem = _porter.stem(tok)
            # 3. Min length.
            if len(stem) < _MIN_STEM_LEN:
                continue
            total_count[stem] = total_count.get(stem, 0) + 1
            seen_in_this_entry.add(stem)
        for stem in seen_in_this_entry:
            distinct_entries[stem] = distinct_entries.get(stem, 0) + 1

    # 6. Distinct-entry count >= 2.
    candidates = [s for s, c in distinct_entries.items() if c >= 2]
    if not candidates:
        return None

    # 5. Blocklist veto. If any candidate is blocked, abort the whole
    # teaser to be safe — we'd rather show nothing than risk a near-miss
    # like "you talked about a name twice".
    if any(s in blocklist for s in candidates):
        return None

    # 4. Allowlist gate.
    candidates = [s for s in candidates if s in allowlist]
    if not candidates:
        return None

    # 7. Tiebreak: distinct-entry count desc, total desc, alphabetical asc.
    candidates.sort(
        key=lambda s: (-distinct_entries[s], -total_count[s], s)
    )
    return candidates[0]
