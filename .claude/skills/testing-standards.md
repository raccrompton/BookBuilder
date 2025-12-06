# Testing Standards

> Reference this file for testing best practices across all languages.

---

## Core Principles

### 1. Test Behavior, Not Implementation
```typescript
// GOOD: Tests what the function does
test('calculateTotal returns sum of item prices plus tax', () => {
    const items = [{ price: 10 }, { price: 20 }];
    expect(calculateTotal(items, 0.1)).toBe(33);
});

// BAD: Tests implementation details
test('calculateTotal calls reduce on items array', () => {
    const spy = jest.spyOn(Array.prototype, 'reduce');
    calculateTotal(items, 0.1);
    expect(spy).toHaveBeenCalled();
});
```

### 2. One Concept Per Test
```typescript
// GOOD: Each test verifies one thing
test('returns empty array when input is empty', () => {
    expect(filterActive([])).toEqual([]);
});

test('filters out inactive items', () => {
    const items = [
        { id: 1, active: true },
        { id: 2, active: false },
    ];
    expect(filterActive(items)).toEqual([{ id: 1, active: true }]);
});

// BAD: Testing multiple concepts
test('filterActive works correctly', () => {
    expect(filterActive([])).toEqual([]);
    expect(filterActive([{ active: true }])).toHaveLength(1);
    expect(filterActive([{ active: false }])).toHaveLength(0);
    // ... more assertions
});
```

### 3. Descriptive Test Names
```typescript
// GOOD: Describes scenario and expected outcome
describe('UserService', () => {
    describe('createUser', () => {
        test('returns user with generated ID when valid data provided', () => {});
        test('throws ValidationError when email is invalid', () => {});
        test('throws DuplicateError when email already exists', () => {});
    });
});

// BAD: Vague names
test('createUser works', () => {});
test('test 1', () => {});
test('should work correctly', () => {});
```

---

## Test Structure (AAA Pattern)

```typescript
test('adds item to cart and updates total', () => {
    // Arrange - Set up test data and conditions
    const cart = new Cart();
    const item = { id: '1', name: 'Widget', price: 9.99 };

    // Act - Perform the action being tested
    cart.addItem(item);

    // Assert - Verify the results
    expect(cart.items).toHaveLength(1);
    expect(cart.total).toBe(9.99);
});
```

---

## Test Organization

### File Structure
```
src/
├── services/
│   ├── user.ts
│   └── user.test.ts          # Co-located tests
├── utils/
│   ├── validation.ts
│   └── validation.test.ts
tests/
├── integration/              # Integration tests
│   └── api.test.ts
└── e2e/                      # End-to-end tests
    └── checkout.spec.ts
```

### Describe Blocks
```typescript
describe('CartService', () => {
    // Setup shared across all tests in this describe
    let cartService: CartService;

    beforeEach(() => {
        cartService = new CartService();
    });

    describe('addItem', () => {
        test('adds item to empty cart', () => {});
        test('increments quantity for existing item', () => {});
    });

    describe('removeItem', () => {
        test('removes item from cart', () => {});
        test('throws error when item not in cart', () => {});
    });
});
```

---

## Edge Cases to Test

### Boundary Conditions
```typescript
describe('pagination', () => {
    test('returns first page when page is 0', () => {});
    test('returns empty array when page exceeds total', () => {});
    test('handles exactly one page of results', () => {});
    test('handles last page with partial results', () => {});
});
```

### Error Conditions
```typescript
describe('error handling', () => {
    test('throws TypeError when input is null', () => {});
    test('throws RangeError when value is negative', () => {});
    test('returns fallback when API fails', () => {});
});
```

### Empty/Null States
```typescript
describe('empty states', () => {
    test('returns empty array for empty input', () => {});
    test('returns null when item not found', () => {});
    test('handles undefined optional parameters', () => {});
});
```

---

## Mocking Best Practices

### Mock External Dependencies
```typescript
// GOOD: Mock external services
jest.mock('./api-client');

test('fetches user data from API', async () => {
    const mockUser = { id: '1', name: 'Test' };
    (apiClient.get as jest.Mock).mockResolvedValue(mockUser);

    const result = await userService.getUser('1');

    expect(result).toEqual(mockUser);
    expect(apiClient.get).toHaveBeenCalledWith('/users/1');
});
```

### Don't Over-Mock
```typescript
// BAD: Mocking the thing you're testing
test('formatDate formats date', () => {
    jest.spyOn(dateUtils, 'formatDate').mockReturnValue('2024-01-01');
    expect(dateUtils.formatDate(new Date())).toBe('2024-01-01');
});

// GOOD: Test actual behavior
test('formatDate returns ISO format', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(formatDate(date)).toBe('2024-01-15');
});
```

---

## Async Testing

```typescript
// GOOD: Async/await pattern
test('fetches user successfully', async () => {
    const user = await userService.getUser('123');
    expect(user.name).toBe('John');
});

// GOOD: Testing rejected promises
test('throws error for invalid ID', async () => {
    await expect(userService.getUser('')).rejects.toThrow('Invalid ID');
});

// GOOD: Testing with timeouts
test('retries failed request', async () => {
    jest.useFakeTimers();

    const promise = retryableRequest();
    jest.advanceTimersByTime(1000);

    await expect(promise).resolves.toBeDefined();
});
```

---

## Test Data

### Use Factories
```typescript
// GOOD: Factory functions for test data
function createUser(overrides: Partial<User> = {}): User {
    return {
        id: 'test-id',
        name: 'Test User',
        email: 'test@example.com',
        createdAt: new Date('2024-01-01'),
        ...overrides,
    };
}

test('displays user name', () => {
    const user = createUser({ name: 'Custom Name' });
    expect(formatUserDisplay(user)).toContain('Custom Name');
});
```

### Avoid Magic Values
```typescript
// BAD: Magic values
test('calculates discount', () => {
    expect(calculateDiscount(100, 'SAVE20')).toBe(80);
});

// GOOD: Named constants
test('applies 20% discount for SAVE20 code', () => {
    const originalPrice = 100;
    const discountCode = 'SAVE20';
    const expectedPrice = 80; // 100 - 20% discount

    expect(calculateDiscount(originalPrice, discountCode)).toBe(expectedPrice);
});
```

---

## Code Coverage

### Meaningful Coverage
- Aim for 80%+ coverage on business logic
- Don't chase 100% - some code isn't worth testing
- Focus on critical paths and edge cases

### What to Test
- Business logic and calculations
- Data transformations
- Error handling paths
- Edge cases and boundaries
- Integration points

### What to Skip
- Simple getters/setters
- Framework boilerplate
- Third-party library internals
- Pure configuration files

---

## Integration Tests

```typescript
describe('User API', () => {
    let app: Application;
    let db: Database;

    beforeAll(async () => {
        db = await createTestDatabase();
        app = createApp(db);
    });

    afterAll(async () => {
        await db.close();
    });

    beforeEach(async () => {
        await db.clear();
    });

    test('POST /users creates new user', async () => {
        const response = await request(app)
            .post('/users')
            .send({ name: 'Test', email: 'test@test.com' });

        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();

        // Verify in database
        const user = await db.users.findById(response.body.id);
        expect(user).toBeDefined();
    });
});
```

---

## E2E Tests

```typescript
// Playwright example
test('user can complete checkout', async ({ page }) => {
    // Navigate to product
    await page.goto('/products/1');

    // Add to cart
    await page.click('[data-testid="add-to-cart"]');

    // Go to checkout
    await page.click('[data-testid="checkout-button"]');

    // Fill shipping info
    await page.fill('[name="address"]', '123 Test St');
    await page.fill('[name="city"]', 'Test City');

    // Complete order
    await page.click('[data-testid="place-order"]');

    // Verify success
    await expect(page.locator('.order-confirmation')).toBeVisible();
});
```
