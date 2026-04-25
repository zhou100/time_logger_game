"""
Tiny Porter stemmer (English) — vendored to avoid an nltk dependency.

This is the original 1980 algorithm by Martin Porter, transliterated from
the public-domain reference implementation (https://tartarus.org/martin/
PorterStemmer/). It's deterministic, ~200 lines, and accurate enough for
the demo teaser surface (we only ever feed it short transcripts, then gate
the result through an allowlist).

Public domain. The only deviation from the reference is that we treat the
input as already lowercased (callers do that before tokenising).

Usage:
    >>> stem("running")
    'run'
    >>> stem("focused")
    'focus'
"""
from __future__ import annotations


_VOWELS = frozenset("aeiou")


def _is_consonant(word: str, i: int) -> bool:
    if word[i] in _VOWELS:
        return False
    if word[i] == "y":
        if i == 0:
            return True
        return not _is_consonant(word, i - 1)
    return True


def _measure(word: str) -> int:
    """Compute Porter's `m` for the given word (number of VC sequences)."""
    n = len(word)
    if n == 0:
        return 0
    # Compress runs of consonants/vowels into a single C/V symbol.
    seq = []
    i = 0
    while i < n:
        if _is_consonant(word, i):
            seq.append("C")
        else:
            seq.append("V")
        # collapse run
        j = i + 1
        while j < n and (_is_consonant(word, j) == (seq[-1] == "C")):
            j += 1
        i = j
    # m = number of "VC" pairs
    m = 0
    for k in range(1, len(seq)):
        if seq[k - 1] == "V" and seq[k] == "C":
            m += 1
    return m


def _has_vowel(stem: str) -> bool:
    return any(not _is_consonant(stem, i) for i in range(len(stem)))


def _ends_double_consonant(word: str) -> bool:
    if len(word) < 2:
        return False
    if word[-1] != word[-2]:
        return False
    return _is_consonant(word, len(word) - 1)


def _ends_cvc(word: str) -> bool:
    """Word ends in C-V-C where the final C is not w, x, or y."""
    if len(word) < 3:
        return False
    if not _is_consonant(word, len(word) - 1):
        return False
    if _is_consonant(word, len(word) - 2):
        return False
    if not _is_consonant(word, len(word) - 3):
        return False
    if word[-1] in {"w", "x", "y"}:
        return False
    return True


def _replace_suffix(word: str, suffix: str, replacement: str) -> str:
    return word[: -len(suffix)] + replacement


def _step1a(word: str) -> str:
    if word.endswith("sses"):
        return word[:-2]
    if word.endswith("ies"):
        return word[:-2]
    if word.endswith("ss"):
        return word
    if word.endswith("s"):
        return word[:-1]
    return word


def _step1b(word: str) -> str:
    if word.endswith("eed"):
        if _measure(word[:-3]) > 0:
            return word[:-1]
        return word

    second_or_third_hit = False
    if word.endswith("ed") and _has_vowel(word[:-2]):
        word = word[:-2]
        second_or_third_hit = True
    elif word.endswith("ing") and _has_vowel(word[:-3]):
        word = word[:-3]
        second_or_third_hit = True

    if second_or_third_hit:
        if word.endswith(("at", "bl", "iz")):
            return word + "e"
        if _ends_double_consonant(word) and not word.endswith(("l", "s", "z")):
            return word[:-1]
        if _measure(word) == 1 and _ends_cvc(word):
            return word + "e"
    return word


def _step1c(word: str) -> str:
    if word.endswith("y") and _has_vowel(word[:-1]):
        return word[:-1] + "i"
    return word


_STEP2_PAIRS = [
    ("ational", "ate"), ("tional", "tion"),
    ("enci", "ence"), ("anci", "ance"),
    ("izer", "ize"), ("abli", "able"), ("alli", "al"),
    ("entli", "ent"), ("eli", "e"), ("ousli", "ous"),
    ("ization", "ize"), ("ation", "ate"), ("ator", "ate"),
    ("alism", "al"), ("iveness", "ive"), ("fulness", "ful"),
    ("ousness", "ous"),
    ("aliti", "al"), ("iviti", "ive"), ("biliti", "ble"),
]


def _step2(word: str) -> str:
    for suffix, replacement in _STEP2_PAIRS:
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if _measure(stem) > 0:
                return stem + replacement
            return word
    return word


_STEP3_PAIRS = [
    ("icate", "ic"), ("ative", ""), ("alize", "al"),
    ("iciti", "ic"), ("ical", "ic"),
    ("ful", ""), ("ness", ""),
]


def _step3(word: str) -> str:
    for suffix, replacement in _STEP3_PAIRS:
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if _measure(stem) > 0:
                return stem + replacement
            return word
    return word


_STEP4_SUFFIXES = (
    "al", "ance", "ence", "er", "ic", "able", "ible", "ant",
    "ement", "ment", "ent", "ou", "ism", "ate", "iti",
    "ous", "ive", "ize",
)


def _step4(word: str) -> str:
    # Special-case "ion" — only strip if preceded by s or t.
    if word.endswith("ion"):
        stem = word[:-3]
        if _measure(stem) > 1 and stem.endswith(("s", "t")):
            return stem
        return word
    for suffix in _STEP4_SUFFIXES:
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if _measure(stem) > 1:
                return stem
            return word
    return word


def _step5a(word: str) -> str:
    if word.endswith("e"):
        stem = word[:-1]
        m = _measure(stem)
        if m > 1:
            return stem
        if m == 1 and not _ends_cvc(stem):
            return stem
    return word


def _step5b(word: str) -> str:
    if (
        len(word) >= 2
        and word.endswith("l")
        and word[-2] == "l"
        and _measure(word[:-1]) > 1
    ):
        return word[:-1]
    return word


def stem(word: str) -> str:
    """Stem a single lowercase ASCII word."""
    if len(word) <= 2:
        return word
    word = _step1a(word)
    word = _step1b(word)
    word = _step1c(word)
    word = _step2(word)
    word = _step3(word)
    word = _step4(word)
    word = _step5a(word)
    word = _step5b(word)
    return word
