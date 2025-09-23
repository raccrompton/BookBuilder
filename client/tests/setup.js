/**
 * Jest test setup file
 * Configures the testing environment for BookBuilder client-side tests
 */

// Mock Web APIs that aren't available in jsdom
global.Worker = class MockWorker {
    constructor(url) {
        this.url = url;
        this.onmessage = null;
        this.onerror = null;
    }
    
    postMessage(data) {
        // Mock implementation - can be overridden in individual tests
    }
    
    terminate() {
        // Mock implementation
    }
};

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Blob constructor
global.Blob = jest.fn((content, options) => ({
    size: content[0].length,
    type: options?.type || 'text/plain'
}));

// Mock sessionStorage
const mockSessionStorage = {
    store: {},
    getItem: jest.fn((key) => mockSessionStorage.store[key] || null),
    setItem: jest.fn((key, value) => {
        mockSessionStorage.store[key] = value;
    }),
    removeItem: jest.fn((key) => {
        delete mockSessionStorage.store[key];
    }),
    clear: jest.fn(() => {
        mockSessionStorage.store = {};
    })
};

Object.defineProperty(window, 'sessionStorage', {
    value: mockSessionStorage
});

// Mock localStorage
const mockLocalStorage = {
    store: {},
    getItem: jest.fn((key) => mockLocalStorage.store[key] || null),
    setItem: jest.fn((key, value) => {
        mockLocalStorage.store[key] = value;
    }),
    removeItem: jest.fn((key) => {
        delete mockLocalStorage.store[key];
    }),
    clear: jest.fn(() => {
        mockLocalStorage.store = {};
    })
};

Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage
});

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    group: jest.fn(),
    groupEnd: jest.fn()
};

// Mock performance.now
Object.defineProperty(window, 'performance', {
    value: {
        now: jest.fn(() => Date.now())
    }
});

// Mock fetch for API calls
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
            moves: [
                { san: 'e4', uci: 'e2e4', white: 100, draws: 50, black: 80 }
            ]
        }),
        text: () => Promise.resolve('{}')
    })
);

// Reset all mocks before each test
beforeEach(() => {
    jest.clearAllMocks();
    mockSessionStorage.store = {};
    mockLocalStorage.store = {};
});

// Clean up after each test
afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
});