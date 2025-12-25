/**
 * Jest test setup file
 * Configures the testing environment for BookBuilder client-side tests
 */

// =============================================================================
// Environment Variable: USE_REAL_ENGINE
// =============================================================================
// When set to 'true', tests will use real Stockfish via Node.js child process
// instead of the mocked Worker. This enables testing the full BookBuilder
// pipeline with real engine analysis to isolate browser-specific issues.
//
// Usage:
//   npm test                           # Default: use mock engine (fast)
//   USE_REAL_ENGINE=true npm test      # Use real Stockfish (slower, real analysis)
//   npm run test:real-engine           # Shorthand for above
//
// =============================================================================
const USE_REAL_ENGINE = process.env.USE_REAL_ENGINE === 'true';

if (USE_REAL_ENGINE) {
    // When using real engine, we don't mock the Worker
    // Tests should use NodeStockfishEngine directly
    console.log('[TEST SETUP] Using real Node.js Stockfish engine (USE_REAL_ENGINE=true)');
    console.log('[TEST SETUP] Tests will use NodeStockfishEngine instead of mocked Worker');
} else {
    // Default: Mock the Worker for fast tests
    // Mock Web APIs that aren't available in jsdom
    global.Worker = jest.fn().mockImplementation(() => {
    const worker = {
        postMessage: jest.fn((command) => {
            // Simulate UCI protocol responses based on command
            setTimeout(() => {
                if (worker.onmessage) {
                    if (command === 'uci') {
                        // Respond with UCI initialization
                        worker.onmessage({ data: 'id name Stockfish 17.1' });
                        worker.onmessage({ data: 'id author T. Romstad, M. Costalba, J. Kiiski, G. Linscott' });
                        worker.onmessage({ data: 'option name Threads type spin default 1 min 1 max 512' });
                        worker.onmessage({ data: 'option name Hash type spin default 16 min 1 max 33554432' });
                        worker.onmessage({ data: 'uciok' });
                    } else if (command.startsWith('setoption')) {
                        // Configuration commands - no response needed
                    } else if (command === 'isready') {
                        // Engine ready check - critical for initialization
                        worker.onmessage({ data: 'readyok' });
                    } else if (command.startsWith('position fen')) {
                        // Position command - no response needed
                    } else if (command.startsWith('go depth')) {
                        // Simulate analysis with info responses
                        const depthMatch = command.match(/depth (\d+)/);
                        const targetDepth = depthMatch ? parseInt(depthMatch[1]) : 15;

                        // Send progressive info responses
                        for (let depth = 1; depth <= Math.min(targetDepth, 3); depth++) {
                            setTimeout(() => {
                                worker.onmessage({
                                    data: `info depth ${depth} score cp 30 nodes 1000 nps 100000 pv e2e4 e7e5`
                                });
                            }, depth * 5);
                        }

                        // Send final best move
                        setTimeout(() => {
                            worker.onmessage({ data: 'bestmove e2e4 ponder e7e5' });
                        }, Math.min(targetDepth, 3) * 5 + 10);
                    } else if (command === 'stop') {
                        worker.onmessage({ data: 'bestmove e2e4' });
                    } else if (command === 'quit') {
                        // No response for quit
                    }
                }
            }, 5); // Small delay to simulate async behavior
        }),
        terminate: jest.fn(),
        onmessage: null,
        onerror: null
    };

    return worker;
    });

    // Mock URL.createObjectURL and revokeObjectURL (browser-only APIs)
    global.URL.createObjectURL = jest.fn(() => 'mock-blob-url');
    global.URL.revokeObjectURL = jest.fn();

    // Mock Blob constructor (browser-only API)
    global.Blob = jest.fn((content, options) => ({
        size: content[0].length,
        type: options?.type || 'text/plain'
    }));
} // End of mock engine setup

// Mock BroadcastChannel (browser-only API for cross-tab communication)
global.BroadcastChannel = jest.fn().mockImplementation(() => ({
    postMessage: jest.fn(),
    close: jest.fn(),
    onmessage: null
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
