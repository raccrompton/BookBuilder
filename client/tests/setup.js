/**
 * Jest test setup file
 * Configures the testing environment for BookBuilder client-side tests
 */

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