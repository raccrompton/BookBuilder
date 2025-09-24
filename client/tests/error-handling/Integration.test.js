/**
 * Integration test for error masking remediation
 */

import { DeterministicMode } from '../../src/config/DeterministicMode.js';

describe('Error Masking Remediation Integration', () => {
    describe('DeterministicMode Integration', () => {
        it('throws errors when conditions fail', () => {
            expect(() => {
                DeterministicMode.throwOnFailure(false, 'Test error message');
            }).toThrow('Test error message');
        });

        it('returns true when conditions pass', () => {
            const result = DeterministicMode.throwOnFailure(true, 'This should not throw');
            expect(result).toBe(true);
        });

        it('validates input correctly', () => {
            expect(() => {
                DeterministicMode.validateInput(null, 'testValue', (val) => val !== null);
            }).toThrow('Invalid testValue: null');

            const result = DeterministicMode.validateInput('valid', 'testValue', (val) => typeof val === 'string');
            expect(result).toBe('valid');
        });
    });

    describe('Error Handling Implementation Validation', () => {
        it('imports work correctly across modules', async () => {
            // Test that our imports are working
            const { DeterministicMode } = await import('../../src/config/DeterministicMode.js');
            const MoveSelector = (await import('../../src/algorithm/MoveSelector.js')).default;
            const BookBuilder = (await import('../../src/BookBuilder.js')).default;

            expect(DeterministicMode).toBeDefined();
            expect(DeterministicMode.throwOnFailure).toBeInstanceOf(Function);
            expect(MoveSelector).toBeDefined();
            expect(BookBuilder).toBeDefined();
        });
    });

    describe('Error Message Quality', () => {
        it('provides descriptive error messages', () => {
            try {
                DeterministicMode.throwOnFailure(false, 'API failure for position rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error.message).toContain('API failure');
                expect(error.message).toContain('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
                expect(error).toBeInstanceOf(Error);
            }
        });

        it('throws Error objects with proper stack traces', () => {
            try {
                DeterministicMode.throwOnFailure(false, 'Stack trace test');
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect(error.stack).toBeDefined();
                expect(error.stack).toContain('throwOnFailure');
            }
        });
    });
});