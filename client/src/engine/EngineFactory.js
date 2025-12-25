/**
 * =============================================================================
 * EngineFactory.js - Factory for Creating Chess Engine Instances
 * =============================================================================
 *
 * PURPOSE:
 * This factory decides whether to create a MockStockfishEngine (for fast testing)
 * or a real StockfishEngine (for production use). This abstraction allows E2E
 * tests to run in seconds instead of minutes.
 *
 * SAFETY:
 * The MockStockfishEngine is ONLY used when BOTH conditions are met:
 * 1. Running on localhost (127.0.0.1 or localhost)
 * 2. URL contains ?testMode=true parameter
 *
 * This prevents accidental use of the mock engine in production.
 *
 * USAGE:
 * ```javascript
 * import { EngineFactory } from './engine/EngineFactory.js';
 *
 * // In FormController or wherever engine is instantiated:
 * const engine = EngineFactory.create({
 *     depth: 20,
 *     hash: 128,
 *     variant: 'lite'
 * });
 *
 * await engine.initialize();
 * const bestMove = await engine.getBestMove(fen);
 * ```
 *
 * FOR E2E TESTS:
 * Navigate to the app with testMode parameter:
 * await page.goto('/?testMode=true');
 *
 * The EngineFactory will automatically use MockStockfishEngine.
 */

import StockfishEngine from './StockfishEngine.js';
import { MockStockfishEngine } from './MockStockfishEngine.js';
import Logger from '../utils/Logger.js';

const log = Logger.get('EngineFactory');

class EngineFactory {
    /**
     * Create the appropriate engine based on environment.
     *
     * @param {Object} config - Engine configuration options
     *   @param {string} config.variant - 'lite' or 'full' (only used by real engine)
     *   @param {number} config.depth - Analysis depth
     *   @param {number} config.hash - Hash table size in MB
     *   @param {number} config.timeout - Timeout in ms
     * @returns {StockfishEngine|MockStockfishEngine} Engine instance
     */
    static create(config = {}) {
        if (this._shouldUseMock()) {
            log.info('[EngineFactory] Using MockStockfishEngine (test mode)');
            return new MockStockfishEngine(config);
        }

        log.info('[EngineFactory] Using StockfishEngine (production mode)');
        return new StockfishEngine(config);
    }

    /**
     * Determine if mock engine should be used.
     *
     * SAFETY: Mock engine is ONLY allowed when:
     * 1. Running on localhost (127.0.0.1 or localhost)
     * 2. URL contains testMode parameter
     *
     * This prevents accidental use of mock engine in production.
     *
     * @returns {boolean} True if mock engine should be used
     */
    static _shouldUseMock() {
        // Safety check: only allow mock on localhost
        if (typeof location === 'undefined') {
            // Node.js/SSR environment - cannot check URL, default to real engine
            return false;
        }

        const hostname = location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

        if (!isLocalhost) {
            return false;
        }

        // Check for testMode URL parameter
        try {
            const params = new URLSearchParams(location.search);
            return params.has('testMode');
        } catch {
            return false;
        }
    }
}

export { EngineFactory };
export default EngineFactory;
