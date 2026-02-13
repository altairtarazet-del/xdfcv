"""
Unified email analysis pipeline.
Flow: Cache check → Rule engine → AI fallback → Cache result

Optimizations:
- Parallel processing via asyncio.gather (up to 5 concurrent)
- Batch DB cache lookup for already-analyzed messages
- Actual AI confidence scores (no hardcoded baseline)
- Timestamp-based cache invalidation when classifier rules change
- Smart body context (first 1500 + last 500 chars)
- Detailed error logging per email
"""
import asyncio
import logging
import time
from datetime import datetime, timezone

from app.database import get_db
from app.services.email_classifier import classify_with_threshold, ClassificationResult
from app.services.ai_analyzer import analyze_email_with_ai
from app.services.template_fingerprint import TemplateCache, make_fingerprint

logger = logging.getLogger(__name__)

# Concurrency limit for parallel email processing
MAX_CONCURRENT = 5

# Classifier rules version — bump when rules in email_classifier.py change.
# Pipeline uses this to invalidate cached analyses from older rule versions.
_CLASSIFIER_RULES_VERSION = "2026-02-13T00:00:00Z"


def _smart_context(body: str) -> str:
    """Keep first 1500 + last 500 chars for meaningful context."""
    if len(body) <= 2000:
        return body
    return body[:1500] + "\n...[truncated]...\n" + body[-500:]


async def _batch_find_cached(
    db,
    account_id: str,
    message_ids: list[str],
) -> dict[str, dict]:
    """Single DB query to find all already-analyzed message IDs for an account."""
    if not message_ids:
        return {}
    # PostgREST in-filter: message_id=in.(id1,id2,...)
    ids_csv = ",".join(message_ids)
    rows = await db.select("email_analyses", filters={
        "account_id": f"eq.{account_id}",
        "message_id": f"in.({ids_csv})",
    })
    return {r["message_id"]: r for r in rows}


def _should_invalidate_cache(cached_row: dict) -> bool:
    """Check if cached result is stale due to classifier rules update."""
    created = cached_row.get("created_at")
    if not created:
        return False
    # Only invalidate rule-based analyses (AI results stay valid)
    if cached_row.get("analysis_source") != "rules":
        return False
    # Parse the cached row's timestamp
    try:
        if isinstance(created, str):
            # Handle Supabase ISO format (may have trailing Z or +00:00)
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        else:
            return False
    except (ValueError, TypeError):
        return False
    rules_dt = datetime.fromisoformat(_CLASSIFIER_RULES_VERSION.replace("Z", "+00:00"))
    return created_dt < rules_dt


async def analyze_email(
    account_id: str,
    message_id: str,
    subject: str,
    sender: str,
    body: str = "",
    template_cache: TemplateCache | None = None,
    _cached_row: dict | None = None,
) -> dict:
    """
    Analyze a single email through the pipeline.
    Returns analysis result dict.

    _cached_row: pre-fetched cache row from batch lookup (internal use).
    """
    db = get_db()

    # 1. Check cache (use pre-fetched row if available, else query)
    if _cached_row is not None:
        cached = _cached_row
    else:
        rows = await db.select("email_analyses", filters={
            "account_id": f"eq.{account_id}",
            "message_id": f"eq.{message_id}",
        })
        cached = rows[0] if rows else None

    if cached and not _should_invalidate_cache(cached):
        return cached

    # Smart context: first 1500 + last 500 for meaningful body content
    body_context = _smart_context(body)

    # 2. Rule engine
    result, needs_ai = classify_with_threshold(subject, sender, body_context)

    analysis_source = "rules"
    raw_ai = None

    # 3. AI fallback if rules couldn't classify with confidence
    if needs_ai:
        try:
            ai_result = await analyze_email_with_ai(subject, sender, body)
        except Exception as e:
            logger.error(
                "AI analysis exception | account=%s message_id=%s subject=%r error_type=%s error=%s",
                account_id, message_id, subject[:80], type(e).__name__, e,
            )
            ai_result = None

        if ai_result:
            analysis_source = "ai"
            raw_ai = ai_result
            # Use actual AI confidence instead of hardcoded baseline
            ai_confidence = ai_result.get("confidence", 0.0)
            result = ClassificationResult(
                category=ai_result["category"],
                sub_category=ai_result["sub_category"],
                confidence=ai_confidence,
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
                    "confidence": ai_confidence,
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
        logger.error(
            "Failed to cache analysis | account=%s message_id=%s subject=%r error_type=%s error=%s",
            account_id, message_id, subject[:80], type(e).__name__, e,
        )
        return analysis_data


async def analyze_account_emails(
    account_id: str,
    messages: list[dict],
) -> list[dict]:
    """
    Analyze all emails for an account.
    Uses batch DB lookup and parallel processing (up to MAX_CONCURRENT).
    Returns list of analysis results.
    """
    if not messages:
        return []

    db = get_db()

    # Extract message IDs for batch cache check
    msg_entries = []
    for msg in messages:
        msg_id = str(msg.get("@id") or msg.get("id", ""))
        subject = msg.get("subject", "")
        sender = msg.get("from", msg.get("sender", ""))
        body = msg.get("html", "") or msg.get("text", "")
        msg_entries.append((msg_id, subject, sender, body))

    all_msg_ids = [e[0] for e in msg_entries]

    # Batch DB check: single query for all message IDs
    cached_map = await _batch_find_cached(db, account_id, all_msg_ids)

    # Separate into cached (valid) and needs-processing
    results: dict[int, dict] = {}  # index → result, preserves order
    to_process: list[tuple[int, str, str, str, str]] = []  # (index, msg_id, subject, sender, body)

    for idx, (msg_id, subject, sender, body) in enumerate(msg_entries):
        cached = cached_map.get(msg_id)
        if cached and not _should_invalidate_cache(cached):
            results[idx] = cached
        else:
            to_process.append((idx, msg_id, subject, sender, body, cached))

    # Process uncached emails in parallel batches
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    template_cache = TemplateCache()

    async def _process_one(idx: int, msg_id: str, subject: str, sender: str, body: str, cached_row: dict | None) -> tuple[int, dict]:
        async with semaphore:
            start = time.monotonic()
            try:
                result = await analyze_email(
                    account_id=account_id,
                    message_id=msg_id,
                    subject=subject,
                    sender=sender,
                    body=body,
                    template_cache=template_cache,
                    _cached_row=cached_row,
                )
                elapsed = time.monotonic() - start
                logger.debug(
                    "Processed email | message_id=%s category=%s elapsed=%.2fs",
                    msg_id, result.get("category", "?"), elapsed,
                )
                return idx, result
            except Exception as e:
                elapsed = time.monotonic() - start
                logger.error(
                    "Email processing failed | account=%s message_id=%s subject=%r "
                    "error_type=%s error=%s elapsed=%.2fs partial_results=%d/%d",
                    account_id, msg_id, subject[:80],
                    type(e).__name__, e, elapsed,
                    len(results), len(msg_entries),
                )
                # Return a fallback result so we don't lose this email
                return idx, {
                    "account_id": account_id,
                    "message_id": msg_id,
                    "category": "unknown",
                    "sub_category": "error",
                    "confidence": 0.0,
                    "analysis_source": "error",
                    "summary": f"Analysis failed: {type(e).__name__}",
                    "urgency": "low",
                    "action_required": False,
                }

    if to_process:
        tasks = [
            _process_one(idx, msg_id, subject, sender, body, cached_row)
            for idx, msg_id, subject, sender, body, cached_row in to_process
        ]
        processed = await asyncio.gather(*tasks)
        for idx, result in processed:
            results[idx] = result

    logger.info(
        "Batch analysis complete | account=%s total=%d cached=%d processed=%d",
        account_id, len(msg_entries), len(msg_entries) - len(to_process), len(to_process),
    )

    # Return in original order
    return [results[i] for i in range(len(msg_entries))]


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
