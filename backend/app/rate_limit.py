"""In-memory rate limiting for login and API endpoints."""
import time
from collections import defaultdict


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        # Clean expired entries
        self._requests[key] = [t for t in self._requests[key] if now - t < self.window]
        if len(self._requests[key]) >= self.max_requests:
            return False
        self._requests[key].append(now)
        return True

    def remaining(self, key: str) -> int:
        now = time.time()
        self._requests[key] = [t for t in self._requests[key] if now - t < self.window]
        return max(0, self.max_requests - len(self._requests[key]))


class LoginTracker:
    """Track failed login attempts per account. Lock after N failures."""
    MAX_FAILURES = 5
    LOCKOUT_SECONDS = 300  # 5 minutes

    def __init__(self):
        self._failures: dict[str, list[float]] = defaultdict(list)

    def record_failure(self, key: str) -> None:
        now = time.time()
        self._failures[key].append(now)

    def is_locked(self, key: str) -> bool:
        now = time.time()
        # Only keep recent failures within lockout window
        self._failures[key] = [t for t in self._failures[key] if now - t < self.LOCKOUT_SECONDS]
        return len(self._failures[key]) >= self.MAX_FAILURES

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


# Singleton rate limiters
login_limiter = RateLimiter(max_requests=10, window_seconds=60)
api_limiter = RateLimiter(max_requests=60, window_seconds=60)
login_tracker = LoginTracker()
