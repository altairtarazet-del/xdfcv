"""
Unified email analysis pipeline.
Flow: Cache check → Rule engine → AI fallback → Cache result
"""
import logging
from datetime import datetime, timezone

from app.database import get_db
from app.services.email_classifier import classify_with_threshold, ClassificationResult
from app.services.ai_analyzer import analyze_email_with_ai
from app.services.template_fingerprint import TemplateCache, make_fingerprint

logger = logging.getLogger(__name__)


async def analyze_email(
    account_id: str,
    message_id: str,
    subject: str,
    sender: str,
    body: str = "",
    template_cache: TemplateCache | None = None,
) -> dict:
    """
    Analyze a single email through the pipeline.
    Returns analysis result dict.
    """
    db = get_db()

    # 1. Check cache
    cached = await db.select("email_analyses", filters={
        "account_id": f"eq.{account_id}",
        "message_id": f"eq.{message_id}",
    })
    if cached:
        return cached[0]

    # 2. Rule engine
    result, needs_ai = classify_with_threshold(subject, sender, body)

    analysis_source = "rules"
    raw_ai = None

    # 3. AI fallback if rules couldn't classify with confidence
    if needs_ai:
        ai_result = await analyze_email_with_ai(subject, sender, body)
        if ai_result:
            analysis_source = "ai"
            raw_ai = ai_result
            # Use AI result
            result = ClassificationResult(
                category=ai_result["category"],
                sub_category=ai_result["sub_category"],
                confidence=0.75,  # AI confidence baseline
                summary=ai_result["summary"],
                urgency=ai_result.get("urgency", "low"),
                action_required=ai_result.get("action_required", False),
            )
            # Store AI result in template cache for cross-account dedup
            if template_cache:
                fingerprint = make_fingerprint(subject, sender)
                template_cache.put(fingerprint, {
                    "category": ai_result["category"],
                    "sub_category": ai_result["sub_category"],
                    "confidence": 0.75,
                    "analysis_source": "ai",
                    "summary": ai_result["summary"],
                    "urgency": ai_result.get("urgency", "low"),
                    "action_required": ai_result.get("action_required", False),
                })

    # If still no result, mark as unknown
    if result is None:
        result = ClassificationResult(
            category="unknown",
            sub_category="unclassified",
            confidence=0.0,
            summary=f"Could not classify: {subject[:100]}",
            urgency="low",
            action_required=False,
        )
        analysis_source = "manual"  # Needs manual review

    # 4. Cache result
    analysis_data = {
        "account_id": account_id,
        "message_id": message_id,
        "category": result.category,
        "sub_category": result.sub_category,
        "confidence": result.confidence,
        "analysis_source": analysis_source,
        "summary": result.summary,
        "urgency": result.urgency,
        "action_required": result.action_required,
        "key_details": raw_ai.get("key_details") if raw_ai else None,
        "raw_ai_response": raw_ai,
    }

    try:
        rows = await db.insert("email_analyses", analysis_data, on_conflict="account_id,message_id")
        return rows[0]
    except Exception as e:
        logger.error("Failed to cache analysis: %s", e)
        return analysis_data


async def analyze_account_emails(
    account_id: str,
    messages: list[dict],
) -> list[dict]:
    """
    Analyze all emails for an account.
    Returns list of analysis results.
    """
    results = []
    for msg in messages:
        msg_id = msg.get("@id") or msg.get("id", "")
        subject = msg.get("subject", "")
        sender = msg.get("from", msg.get("sender", ""))
        body = msg.get("html", "") or msg.get("text", "")

        result = await analyze_email(
            account_id=account_id,
            message_id=str(msg_id),
            subject=subject,
            sender=sender,
            body=body,
        )
        results.append(result)
    return results


async def get_account_analyses(account_id: str) -> list[dict]:
    """Get all cached analyses for an account."""
    db = get_db()
    return await db.select(
        "email_analyses",
        filters={"account_id": f"eq.{account_id}"},
        order="created_at.desc",
    )


async def get_analysis_stats() -> dict:
    """Get global analysis statistics."""
    db = get_db()
    all_analyses = await db.select("email_analyses", columns="category,analysis_source,urgency", limit=10000)

    category_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    urgency_counts: dict[str, int] = {}

    for a in all_analyses:
        cat = a.get("category", "unknown")
        category_counts[cat] = category_counts.get(cat, 0) + 1
        src = a.get("analysis_source", "unknown")
        source_counts[src] = source_counts.get(src, 0) + 1
        urg = a.get("urgency", "low")
        urgency_counts[urg] = urgency_counts.get(urg, 0) + 1

    return {
        "total": len(all_analyses),
        "by_category": category_counts,
        "by_source": source_counts,
        "by_urgency": urgency_counts,
    }


async def get_review_queue() -> list[dict]:
    """Get emails that need manual review (low confidence or unknown category)."""
    db = get_db()
    return await db.select(
        "email_analyses",
        filters={"analysis_source": "eq.manual"},
        order="created_at.desc",
        limit=50,
    )
