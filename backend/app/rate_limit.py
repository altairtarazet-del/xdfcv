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


# Singleton rate limiters
login_limiter = RateLimiter(max_requests=10, window_seconds=60)
api_limiter = RateLimiter(max_requests=60, window_seconds=60)
