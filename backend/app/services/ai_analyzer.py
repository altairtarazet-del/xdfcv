"""
AI-powered email analyzer using Synthetic API (OpenAI-compatible).
Falls back for emails the rule engine can't classify with high confidence.
"""
import json
import logging

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
- unknown: unclassified

Urgency levels: critical, high, medium, low, info

JSON format:
{
  "category": "string",
  "sub_category": "string",
  "summary": "1-2 sentence summary",
  "urgency": "string",
  "action_required": true/false,
  "key_details": {"any": "relevant details"}
}"""


async def analyze_email_with_ai(subject: str, sender: str, body: str = "") -> dict | None:
    """
    Use Synthetic API to classify an email.
    Returns dict with category, sub_category, summary, urgency, action_required, key_details.
    Returns None if API is not configured or fails.
    """
    if not settings.synthetic_api_key:
        logger.warning("Synthetic API key not configured, skipping AI analysis")
        return None

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=settings.synthetic_api_key,
            base_url=settings.synthetic_api_base,
        )

        user_content = f"Subject: {subject}\nFrom: {sender}\n"
        if body:
            # Truncate body to avoid token limits
            user_content += f"\nBody (first 2000 chars):\n{body[:2000]}"

        response = await client.chat.completions.create(
            model=settings.synthetic_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
            max_tokens=500,
        )

        text = response.choices[0].message.content.strip()

        # Parse JSON from response (handle markdown code blocks)
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        result = json.loads(text)

        # Validate required fields
        required = {"category", "sub_category", "summary", "urgency", "action_required"}
        if not required.issubset(result.keys()):
            logger.warning("AI response missing required fields: %s", result)
            return None

        return result

    except ImportError:
        logger.warning("openai package not installed, skipping AI analysis")
        return None
    except json.JSONDecodeError as e:
        logger.error("Failed to parse AI response as JSON: %s", e)
        return None
    except Exception as e:
        logger.error("AI analysis failed: %s", e)
        return None
