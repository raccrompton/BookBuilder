/**
 * Test suite for DeterministicMode configuration
 */

import { DeterministicMode } from '../../src/config/DeterministicMode.js';

describe('DeterministicMode', () => {
    describe('throwOnFailure', () => {
        it('returns true when condition is true', () => {
            const result = DeterministicMode.throwOnFailure(true, 'Test error');
            expect(result).toBe(true);
        });

        it('throws error when condition is false', () => {
            expect(() => DeterministicMode.throwOnFailure(false, 'Test error message'))
                .toThrow('Test error message');
        });

        it('throws Error instance with correct message', () => {
            try {
                DeterministicMode.throwOnFailure(false, 'Specific test error');
                fail('Expected error to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toBe('Specific test error');
            }
        });
    });

    describe('validateInput', () => {
        it('returns value when validation passes', () => {
            const validator = (val) => val > 0;
            const result = DeterministicMode.validateInput(5, 'testValue', validator);
            expect(result).toBe(5);
        });

        it('throws error when validation fails', () => {
            const validator = (val) => val > 0;
            expect(() => DeterministicMode.validateInput(-1, 'positiveNumber', validator))
                .toThrow('Invalid positiveNumber: -1');
        });

        it('works with string validation', () => {
            const validator = (val) => typeof val === 'string' && val.length > 0;
            const result = DeterministicMode.validateInput('test', 'stringValue', validator);
            expect(result).toBe('test');

            expect(() => DeterministicMode.validateInput('', 'nonEmptyString', validator))
                .toThrow('Invalid nonEmptyString: ');
        });
    });
});