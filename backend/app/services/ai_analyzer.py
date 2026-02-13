"""
AI-powered email analyzer using Synthetic API (OpenAI-compatible).
Falls back for emails the rule engine can't classify with high confidence.
"""
import asyncio
import json
import logging
import re
import time

from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an email analysis assistant for DasherHelp, a DoorDash Dasher account management platform.
Analyze the given email and classify it. Respond ONLY with valid JSON, no other text.

Categories and sub-categories:
- bgc: submitted, pending, clear, consider, identity_verified
- account: welcome, activation, deactivation, reactivation
- earnings: weekly_pay, direct_deposit, earnings_summary, tax_document
- operational: dash_opportunity, rating_update, policy_update, promotion
- warning: contract_violation, low_rating_warning
- insurance: coverage_update, claim_status, policy_info
- scheduling: shift_reminder, schedule_change, availability_update
- equipment: delivery_bag, red_card, equipment_return
- unknown: unclassified

Urgency levels: critical, high, medium, low, info

JSON format:
{
  "category": "string",
  "sub_category": "string",
  "summary": "1-2 sentence summary",
  "urgency": "string",
  "action_required": true/false,
  "key_details": {"any": "relevant details"},
  "confidence": 0.0-1.0
}"""

REQUIRED_FIELDS = {"category", "sub_category", "summary", "urgency", "action_required"}

FIELD_DEFAULTS = {
    "category": "unknown",
    "sub_category": "unclassified",
    "summary": "",
    "urgency": "info",
    "action_required": False,
    "key_details": {},
    "confidence": 0.0,
}

MAX_RETRIES = 3
RETRY_BACKOFFS = [1, 2, 4]  # seconds
API_TIMEOUT = 30  # seconds


def _smart_truncate(body: str, max_total: int = 2000) -> str:
    """Keep first 1500 + last 500 chars to capture beginning and end of email."""
    if len(body) <= max_total:
        return body
    head = 1500
    tail = 500
    return body[:head] + "\n...[truncated]...\n" + body[-tail:]


def _extract_json(text: str) -> dict:
    """Extract JSON from AI response, handling markdown blocks and surrounding text."""
    # Try markdown code block first
    if "```" in text:
        parts = text.split("```")
        for part in parts[1::2]:  # odd-indexed parts are inside code blocks
            cleaned = part.strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                continue

    # Try direct parse
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Regex: find first { ... } block
    match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group())

    raise json.JSONDecodeError("No valid JSON found in response", text, 0)


def _validate_response(result: dict) -> dict:
    """Ensure required fields exist, filling defaults for missing ones."""
    for field, default in FIELD_DEFAULTS.items():
        if field not in result:
            result[field] = default
    # Clamp confidence to 0.0-1.0
    try:
        result["confidence"] = max(0.0, min(1.0, float(result["confidence"])))
    except (ValueError, TypeError):
        result["confidence"] = 0.0
    return result


async def analyze_email_with_ai(subject: str, sender: str, body: str = "") -> dict | None:
    """
    Use Synthetic API to classify an email.
    Returns dict with category, sub_category, summary, urgency, action_required, key_details, confidence.
    Returns None if API is not configured or fails after retries.
    """
    if not settings.synthetic_api_key:
        logger.warning("Synthetic API key not configured, skipping AI analysis")
        return None

    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.warning("openai package not installed, skipping AI analysis")
        return None

    client = AsyncOpenAI(
        api_key=settings.synthetic_api_key,
        base_url=settings.synthetic_api_base,
    )

    user_content = f"Subject: {subject}\nFrom: {sender}\n"
    if body:
        truncated = _smart_truncate(body)
        user_content += f"\nBody:\n{truncated}"

    email_length = len(body) if body else 0
    logger.info("AI analysis started | email_length=%d subject=%r", email_length, subject[:80])

    last_error = None
    for attempt in range(MAX_RETRIES):
        start_time = time.monotonic()
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=settings.synthetic_model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_content},
                    ],
                    temperature=0.2,
                    max_tokens=500,
                ),
                timeout=API_TIMEOUT,
            )

            elapsed = time.monotonic() - start_time
            text = response.choices[0].message.content.strip()
            result = _extract_json(text)
            result = _validate_response(result)

            logger.info(
                "AI analysis complete | category=%s confidence=%.2f elapsed=%.2fs",
                result.get("category"),
                result.get("confidence", 0.0),
                elapsed,
            )
            return result

        except asyncio.TimeoutError:
            elapsed = time.monotonic() - start_time
            last_error = f"API timeout after {elapsed:.1f}s"
            logger.warning("AI analysis timeout (attempt %d/%d)", attempt + 1, MAX_RETRIES)
        except json.JSONDecodeError as e:
            elapsed = time.monotonic() - start_time
            last_error = f"JSON parse error: {e}"
            logger.warning("AI response parse failed (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, e)
        except Exception as e:
            elapsed = time.monotonic() - start_time
            last_error = str(e)
            logger.warning("AI analysis error (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, e)

        if attempt < MAX_RETRIES - 1:
            backoff = RETRY_BACKOFFS[attempt]
            logger.info("Retrying in %ds...", backoff)
            await asyncio.sleep(backoff)

    logger.error("AI analysis failed after %d retries | last_error=%s", MAX_RETRIES, last_error)
    return None
