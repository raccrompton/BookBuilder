/**
 * =============================================================================
 * engine-factory.test.js - Unit Tests for EngineFactory
 * =============================================================================
 *
 * PURPOSE:
 * Tests that EngineFactory correctly selects between MockStockfishEngine and
 * StockfishEngine based on environment conditions.
 *
 * SAFETY VERIFICATION:
 * These tests verify that MockStockfishEngine is ONLY used when:
 * 1. Running on localhost
 * 2. URL contains testMode parameter
 */

import { EngineFactory } from '../../src/engine/EngineFactory.js';
import { MockStockfishEngine } from '../../src/engine/MockStockfishEngine.js';

describe('EngineFactory', () => {
    // Store original location properties
    const originalLocation = window.location;

    /**
     * Helper to mock window.location for testing
     * jsdom's location is read-only, so we need to delete and redefine it
     */
    function mockLocation(hostname, search = '') {
        delete window.location;
        window.location = {
            hostname: hostname,
            search: search,
            href: `http://${hostname}/${search}`,
            origin: `http://${hostname}`,
            protocol: 'http:',
            host: hostname,
            pathname: '/',
            hash: ''
        };
    }

    afterEach(() => {
        // Restore original location
        delete window.location;
        window.location = originalLocation;
    });

    describe('create()', () => {
        test('returns an engine with the correct interface', () => {
            const engine = EngineFactory.create();

            // Verify it has the required methods
            expect(typeof engine.initialize).toBe('function');
            expect(typeof engine.getBestMove).toBe('function');
            expect(typeof engine.evaluatePosition).toBe('function');
            expect(typeof engine.shutdown).toBe('function');
        });

        test('accepts config options', () => {
            const engine = EngineFactory.create({
                depth: 25,
                hash: 256
            });

            const config = engine.getConfig();
            expect(config.depth).toBe(25);
            expect(config.hash).toBe(256);
        });
    });

    describe('_shouldUseMock() - Safety Checks', () => {
        test('returns false when not on localhost', () => {
            mockLocation('bookbuilder.com', '?testMode=true');
            expect(EngineFactory._shouldUseMock()).toBe(false);
        });

        test('returns false when testMode parameter is missing', () => {
            mockLocation('localhost', '');
            expect(EngineFactory._shouldUseMock()).toBe(false);
        });

        test('returns true on localhost with testMode=true', () => {
            mockLocation('localhost', '?testMode=true');
            expect(EngineFactory._shouldUseMock()).toBe(true);
        });

        test('returns true on 127.0.0.1 with testMode=true', () => {
            mockLocation('127.0.0.1', '?testMode=true');
            expect(EngineFactory._shouldUseMock()).toBe(true);
        });

        test('returns true when testMode is present without value', () => {
            mockLocation('localhost', '?testMode');
            expect(EngineFactory._shouldUseMock()).toBe(true);
        });

        test('returns true when testMode is among other parameters', () => {
            mockLocation('localhost', '?debug=true&testMode=true&scenario=winning');
            expect(EngineFactory._shouldUseMock()).toBe(true);
        });
    });

    describe('Integration: Correct Engine Selection', () => {
        test('creates MockStockfishEngine on localhost with testMode', () => {
            mockLocation('localhost', '?testMode=true');
            const engine = EngineFactory.create();
            expect(engine).toBeInstanceOf(MockStockfishEngine);
        });

        test('creates StockfishEngine in production environment', () => {
            mockLocation('bookbuilder.com', '');

            // Note: In jsdom test environment, real StockfishEngine may not load
            // We just verify it doesn't return MockStockfishEngine
            const engine = EngineFactory.create();

            // Should NOT be MockStockfishEngine
            expect(engine).not.toBeInstanceOf(MockStockfishEngine);
        });

        test('creates StockfishEngine on localhost without testMode', () => {
            mockLocation('localhost', '');
            const engine = EngineFactory.create();
            expect(engine).not.toBeInstanceOf(MockStockfishEngine);
        });
    });

    describe('Configuration Passthrough', () => {
        test('passes config to MockStockfishEngine', () => {
            mockLocation('localhost', '?testMode=true');

            const engine = EngineFactory.create({
                depth: 15,
                hash: 64,
                variant: 'lite'
            });

            const config = engine.getConfig();
            expect(config.depth).toBe(15);
            expect(config.hash).toBe(64);
        });
    });
});
