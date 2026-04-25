"""
OpenAI cost math for anonymous demo requests.

Rates below are the posted list prices for the models we call from the demo
pipeline. They are hardcoded here (not env-driven) so a deploy-time config
typo cannot silently under-count cost and blow the daily cap. Revisit each
time OpenAI adjusts pricing.

Last reviewed: 2026-04 (see
https://openai.com/api/pricing/ — Whisper / gpt-4o-mini).

    Whisper:       $0.006 per minute  = $0.0001 per second
    gpt-4o-mini:   $0.00015 per 1K input tokens
                   $0.0006  per 1K output tokens
"""
from __future__ import annotations

from decimal import Decimal


# --- Whisper -----------------------------------------------------------------
WHISPER_USD_PER_SECOND: Decimal = Decimal("0.0001")


def whisper_cost_usd(audio_seconds: float | int | None) -> Decimal:
    """Cost of one Whisper call. Handles None / 0 gracefully."""
    if not audio_seconds or audio_seconds <= 0:
        return Decimal("0")
    return (Decimal(str(audio_seconds)) * WHISPER_USD_PER_SECOND).quantize(
        Decimal("0.0001")
    )


# --- GPT-4o-mini -------------------------------------------------------------
GPT_MINI_USD_PER_1K_INPUT: Decimal = Decimal("0.00015")
GPT_MINI_USD_PER_1K_OUTPUT: Decimal = Decimal("0.0006")


def gpt_mini_cost_usd(input_tokens: int | None, output_tokens: int | None) -> Decimal:
    """Cost of one gpt-4o-mini call."""
    in_cost = Decimal("0")
    out_cost = Decimal("0")
    if input_tokens and input_tokens > 0:
        in_cost = (Decimal(input_tokens) / Decimal("1000")) * GPT_MINI_USD_PER_1K_INPUT
    if output_tokens and output_tokens > 0:
        out_cost = (
            Decimal(output_tokens) / Decimal("1000")
        ) * GPT_MINI_USD_PER_1K_OUTPUT
    return (in_cost + out_cost).quantize(Decimal("0.0001"))


def total_demo_cost_usd(
    *,
    audio_seconds: float | int | None,
    gpt_input_tokens: int | None,
    gpt_output_tokens: int | None,
) -> Decimal:
    """Sum of Whisper + GPT costs for a single demo entry run."""
    return (
        whisper_cost_usd(audio_seconds)
        + gpt_mini_cost_usd(gpt_input_tokens, gpt_output_tokens)
    ).quantize(Decimal("0.0001"))
