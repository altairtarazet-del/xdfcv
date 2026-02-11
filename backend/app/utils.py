"""Shared utility functions."""


def mask_email(email: str) -> str:
    """Mask email for safe logging: j***@dasherhelp.com"""
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"
