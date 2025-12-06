# Python Coding Standards

> Reference this file when working with Python projects.

---

## Style Guide

Follow PEP 8 with these project-specific additions.

---

## Type Hints

### Required for All Functions

```python
# GOOD: Full type hints
def calculate_total(items: list[CartItem], tax_rate: float) -> float:
    subtotal = sum(item.price for item in items)
    return subtotal * (1 + tax_rate)


# BAD: No type hints
def calculate_total(items, tax_rate):
    subtotal = sum(item.price for item in items)
    return subtotal * (1 + tax_rate)
```

### Complex Types

```python
from typing import TypeVar, Generic, Callable, Optional, Union
from collections.abc import Sequence, Mapping

# Type aliases for readability
UserId = str
JsonDict = dict[str, Any]

# Generic types
T = TypeVar('T')

def first_or_none(items: Sequence[T]) -> Optional[T]:
    return items[0] if items else None

# Callable types
Handler = Callable[[Request], Response]
```

---

## Classes

### Dataclasses for Data Containers

```python
from dataclasses import dataclass, field
from datetime import datetime

# GOOD: Dataclass for data structures
@dataclass
class User:
    id: str
    name: str
    email: str
    created_at: datetime = field(default_factory=datetime.now)
    is_active: bool = True


# GOOD: Frozen for immutability
@dataclass(frozen=True)
class Point:
    x: float
    y: float
```

### Class Organization

```python
class UserService:
    """Handles user-related operations."""

    # Class constants first
    MAX_LOGIN_ATTEMPTS = 5
    SESSION_TIMEOUT = 3600

    def __init__(self, db: Database) -> None:
        """Initialize with database connection."""
        self._db = db
        self._cache: dict[str, User] = {}

    # Public methods
    def get_user(self, user_id: str) -> Optional[User]:
        """Retrieve user by ID."""
        if user_id in self._cache:
            return self._cache[user_id]
        return self._fetch_user(user_id)

    # Private methods (prefixed with _)
    def _fetch_user(self, user_id: str) -> Optional[User]:
        """Fetch user from database."""
        return self._db.query(User).get(user_id)
```

---

## Functions

### Single Responsibility

```python
# GOOD: Each function does one thing
def validate_email(email: str) -> bool:
    """Check if email format is valid."""
    pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    return bool(re.match(pattern, email))


def send_welcome_email(user: User) -> None:
    """Send welcome email to new user."""
    # Only handles sending
    ...
```

### Guard Clauses

```python
# GOOD: Return early for edge cases
def process_order(order: Optional[Order]) -> OrderResult:
    if order is None:
        return OrderResult(success=False, error="No order provided")

    if not order.items:
        return OrderResult(success=False, error="Order has no items")

    if not order.payment_method:
        return OrderResult(success=False, error="No payment method")

    # Main logic - not deeply nested
    return _process_valid_order(order)


# BAD: Deeply nested
def process_order(order: Optional[Order]) -> OrderResult:
    if order is not None:
        if order.items:
            if order.payment_method:
                # Logic buried in nesting
                ...
```

---

## Error Handling

### Custom Exceptions

```python
class AppError(Exception):
    """Base exception for application errors."""
    pass


class ValidationError(AppError):
    """Raised when validation fails."""

    def __init__(self, message: str, field: str) -> None:
        super().__init__(message)
        self.field = field


class NotFoundError(AppError):
    """Raised when resource is not found."""
    pass
```

### Specific Exception Handling

```python
# GOOD: Specific exceptions
try:
    user = get_user(user_id)
except NotFoundError:
    return {"error": "User not found"}, 404
except ValidationError as e:
    return {"error": e.message, "field": e.field}, 400
except Exception as e:
    logger.exception("Unexpected error")
    return {"error": "Internal server error"}, 500


# BAD: Bare except or catching Exception broadly
try:
    user = get_user(user_id)
except:
    pass
```

---

## Async/Await

```python
import asyncio
from typing import Any

# GOOD: Proper async patterns
async def fetch_user(user_id: str) -> User:
    """Fetch user from API."""
    async with aiohttp.ClientSession() as session:
        async with session.get(f"/api/users/{user_id}") as response:
            if response.status != 200:
                raise NotFoundError(f"User {user_id} not found")
            data = await response.json()
            return User(**data)


# GOOD: Parallel execution
async def load_dashboard(user_id: str) -> Dashboard:
    """Load all dashboard data in parallel."""
    user, settings, notifications = await asyncio.gather(
        fetch_user(user_id),
        fetch_settings(user_id),
        fetch_notifications(user_id),
    )
    return Dashboard(user=user, settings=settings, notifications=notifications)
```

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | snake_case | `user_name`, `is_active` |
| Functions | snake_case | `get_user_by_id`, `validate_input` |
| Classes | PascalCase | `UserService`, `ApiClient` |
| Constants | SCREAMING_SNAKE | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| Private | Leading underscore | `_internal_method`, `_cache` |
| Modules | snake_case | `user_service.py`, `api_client.py` |

---

## Imports

```python
# GOOD: Organized imports (use isort)

# 1. Standard library
import os
import sys
from datetime import datetime
from typing import Optional

# 2. Third-party packages
import requests
from pydantic import BaseModel

# 3. Local imports
from app.services import UserService
from app.models import User
from .utils import format_date
```

---

## Constants

```python
# GOOD: Named constants in module or class
MAX_LOGIN_ATTEMPTS = 5
SESSION_TIMEOUT_SECONDS = 30 * 60  # 30 minutes
VALID_STATUSES = frozenset({"pending", "active", "completed"})


# BAD: Magic numbers
if attempts > 5:
    ...

time.sleep(1800)
```

---

## List Comprehensions

```python
# GOOD: Simple, readable comprehensions
active_users = [user for user in users if user.is_active]
user_names = [user.name for user in users]
user_map = {user.id: user for user in users}

# BAD: Complex comprehensions - use loops instead
result = [
    transform(item)
    for category in categories
    for item in category.items
    if item.is_valid and item.status == "active"
]

# BETTER: Loop for complex logic
result = []
for category in categories:
    for item in category.items:
        if item.is_valid and item.status == "active":
            result.append(transform(item))
```

---

## Context Managers

```python
# GOOD: Use context managers for resources
with open("data.json") as f:
    data = json.load(f)

async with aiohttp.ClientSession() as session:
    response = await session.get(url)

with db.transaction():
    db.execute(query1)
    db.execute(query2)
```

---

## Documentation

```python
def calculate_shipping(
    weight: float,
    destination: str,
    express: bool = False,
) -> float:
    """
    Calculate shipping cost based on weight and destination.

    Args:
        weight: Package weight in kilograms.
        destination: Two-letter country code.
        express: Whether to use express shipping.

    Returns:
        Shipping cost in USD.

    Raises:
        ValidationError: If weight is negative or destination is invalid.

    Example:
        >>> calculate_shipping(2.5, "US", express=True)
        24.99
    """
    if weight < 0:
        raise ValidationError("Weight cannot be negative", "weight")
    ...
```
