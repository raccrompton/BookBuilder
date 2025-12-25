/**
 * =============================================================================
 * job-store.test.js - Unit Tests for JobStore
 * =============================================================================
 *
 * PURPOSE:
 * Tests the JobStore class which provides IndexedDB persistence for analysis jobs.
 * This enables jobs to survive page refreshes and browser restarts.
 *
 * KEY CONCEPTS:
 * - IndexedDB: Browser-native key-value store with async API
 * - idb library: Promise-based wrapper that simplifies IndexedDB usage
 * - CRUD operations: Create, Read, Update, Delete - the basic database operations
 *
 * NOTE:
 * These tests mock the idb library since IndexedDB isn't available in jsdom.
 * Integration tests with real IndexedDB would run in browser environment.
 */

/**
 * Mock setup for idb library.
 * Jest hoists jest.mock() calls, so we need to define the mock factory inline.
 * The actual mock instance is created fresh in beforeEach for test isolation.
 */

// Jest.mock must use inline factory function due to hoisting
jest.mock('idb', () => ({
    openDB: jest.fn(() => Promise.resolve({
        put: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
        getAll: jest.fn(),
        getAllFromIndex: jest.fn(),
        transaction: jest.fn(),
    }))
}));

import { openDB } from 'idb';
import { JobStore, JOB_STATUS } from '../../src/jobs/JobStore.js';

describe('JobStore', () => {
    let jobStore;
    let mockDb;

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();

        // Create fresh mock database instance for this test
        mockDb = {
            put: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            getAll: jest.fn().mockResolvedValue([]),
            getAllFromIndex: jest.fn().mockResolvedValue([]),
            transaction: jest.fn(),
        };

        // Configure openDB to return our mock instance
        openDB.mockResolvedValue(mockDb);

        // Create fresh JobStore instance
        jobStore = new JobStore();
    });

    describe('JOB_STATUS constants', () => {
        test('defines all required job statuses', () => {
            expect(JOB_STATUS.PENDING).toBe('pending');
            expect(JOB_STATUS.RUNNING).toBe('running');
            expect(JOB_STATUS.COMPLETED).toBe('completed');
            expect(JOB_STATUS.FAILED).toBe('failed');
            expect(JOB_STATUS.CANCELLED).toBe('cancelled');
        });
    });

    describe('create()', () => {
        test('creates a job with generated ID and timestamps', async () => {
            const config = {
                pgn: '1. e4 c5',
                depth: 15,
                format: 'tree'
            };

            const job = await jobStore.create({ config });

            // Verify job structure
            expect(job.id).toMatch(/^job_\d+_[a-z0-9]+$/); // ID format: job_timestamp_randomChars
            expect(job.status).toBe(JOB_STATUS.PENDING);
            expect(job.config).toEqual(config);
            expect(job.createdAt).toBeDefined();
            expect(job.updatedAt).toBeDefined();
            expect(job.createdAt).toBe(job.updatedAt); // Same on creation

            // Verify it was saved to database
            expect(mockDb.put).toHaveBeenCalledWith('jobs', expect.objectContaining({
                id: job.id,
                status: 'pending'
            }));
        });

        test('allows custom job ID', async () => {
            const job = await jobStore.create({
                id: 'custom-job-123',
                config: { pgn: '1. d4' }
            });

            expect(job.id).toBe('custom-job-123');
        });

        test('initializes progress and result as null', async () => {
            const job = await jobStore.create({ config: {} });

            expect(job.progress).toBeNull();
            expect(job.result).toBeNull();
            expect(job.error).toBeNull();
        });
    });

    describe('get()', () => {
        test('retrieves job by ID', async () => {
            const mockJob = {
                id: 'job_123',
                status: 'running',
                config: { pgn: '1. e4' }
            };
            mockDb.get.mockResolvedValue(mockJob);

            const job = await jobStore.get('job_123');

            expect(job).toEqual(mockJob);
            expect(mockDb.get).toHaveBeenCalledWith('jobs', 'job_123');
        });

        test('returns undefined for non-existent job', async () => {
            mockDb.get.mockResolvedValue(undefined);

            const job = await jobStore.get('non-existent');

            expect(job).toBeUndefined();
        });
    });

    describe('update()', () => {
        test('updates existing job with new data', async () => {
            const existingJob = {
                id: 'job_123',
                status: 'pending',
                config: { pgn: '1. e4' },
                createdAt: 1000,
                updatedAt: 1000
            };
            mockDb.get.mockResolvedValue(existingJob);

            const updated = await jobStore.update('job_123', {
                status: 'running',
                progress: { currentLine: 5 }
            });

            expect(updated.status).toBe('running');
            expect(updated.progress).toEqual({ currentLine: 5 });
            expect(updated.updatedAt).toBeGreaterThan(existingJob.createdAt);

            // Verify put was called with merged data
            expect(mockDb.put).toHaveBeenCalledWith('jobs', expect.objectContaining({
                id: 'job_123',
                status: 'running',
                progress: { currentLine: 5 }
            }));
        });

        test('throws error for non-existent job', async () => {
            mockDb.get.mockResolvedValue(undefined);

            await expect(jobStore.update('non-existent', { status: 'running' }))
                .rejects
                .toThrow('Job non-existent not found');
        });

        test('preserves existing fields not in update', async () => {
            const existingJob = {
                id: 'job_123',
                status: 'running',
                config: { pgn: '1. e4' },
                progress: { currentLine: 3 },
                createdAt: 1000,
                updatedAt: 1000
            };
            mockDb.get.mockResolvedValue(existingJob);

            const updated = await jobStore.update('job_123', {
                progress: { currentLine: 5 }
            });

            expect(updated.status).toBe('running'); // Preserved
            expect(updated.config).toEqual({ pgn: '1. e4' }); // Preserved
        });
    });

    describe('delete()', () => {
        test('deletes job by ID', async () => {
            await jobStore.delete('job_123');

            expect(mockDb.delete).toHaveBeenCalledWith('jobs', 'job_123');
        });
    });

    describe('getByStatus()', () => {
        test('returns all jobs with given status', async () => {
            const runningJobs = [
                { id: 'job_1', status: 'running' },
                { id: 'job_2', status: 'running' }
            ];
            mockDb.getAllFromIndex.mockResolvedValue(runningJobs);

            const jobs = await jobStore.getByStatus('running');

            expect(jobs).toEqual(runningJobs);
            expect(mockDb.getAllFromIndex).toHaveBeenCalledWith('jobs', 'status', 'running');
        });

        test('returns empty array when no jobs match', async () => {
            mockDb.getAllFromIndex.mockResolvedValue([]);

            const jobs = await jobStore.getByStatus('cancelled');

            expect(jobs).toEqual([]);
        });
    });

    describe('getInProgress()', () => {
        test('returns first running job', async () => {
            const runningJob = { id: 'job_1', status: 'running' };
            mockDb.getAllFromIndex.mockResolvedValue([runningJob]);

            const job = await jobStore.getInProgress();

            expect(job).toEqual(runningJob);
        });

        test('returns null when no running jobs', async () => {
            mockDb.getAllFromIndex.mockResolvedValue([]);

            const job = await jobStore.getInProgress();

            expect(job).toBeNull();
        });
    });

    describe('getAll()', () => {
        test('returns all jobs', async () => {
            const allJobs = [
                { id: 'job_1', status: 'completed' },
                { id: 'job_2', status: 'running' }
            ];
            mockDb.getAll.mockResolvedValue(allJobs);

            const jobs = await jobStore.getAll();

            expect(jobs).toEqual(allJobs);
        });
    });

    describe('cleanup()', () => {
        test('removes old completed jobs', async () => {
            const now = Date.now();
            const oldJob = { id: 'old_job', status: 'completed', createdAt: now - 48 * 60 * 60 * 1000 }; // 48 hours old
            const recentJob = { id: 'recent_job', status: 'completed', createdAt: now - 1000 }; // Recent
            const runningJob = { id: 'running_job', status: 'running', createdAt: now - 48 * 60 * 60 * 1000 }; // Old but running

            // Mock cursor iteration
            const mockStore = {
                openCursor: jest.fn()
            };
            const mockTx = {
                objectStore: jest.fn(() => mockStore)
            };
            mockDb.transaction.mockReturnValue(mockTx);

            // Simulate cursor with jobs
            let cursorIndex = 0;
            const jobs = [oldJob, recentJob, runningJob];
            const mockCursor = {
                value: null,
                delete: jest.fn().mockResolvedValue(undefined),
                continue: jest.fn(() => {
                    cursorIndex++;
                    if (cursorIndex < jobs.length) {
                        mockCursor.value = jobs[cursorIndex];
                        return Promise.resolve(mockCursor);
                    }
                    return Promise.resolve(null);
                })
            };
            mockCursor.value = jobs[0];
            mockStore.openCursor.mockResolvedValue(mockCursor);

            await jobStore.cleanup(24 * 60 * 60 * 1000); // 24 hour threshold

            // Only old completed job should be deleted
            expect(mockCursor.delete).toHaveBeenCalledTimes(1);
        });
    });

    describe('Database Initialization', () => {
        test('opens database with correct name and version', async () => {
            // Trigger database initialization
            await jobStore.create({ config: {} });

            expect(openDB).toHaveBeenCalledWith(
                'bookbuilder',
                1,
                expect.objectContaining({
                    upgrade: expect.any(Function)
                })
            );
        });

        test('reuses existing database connection', async () => {
            // Multiple operations should reuse the same connection
            await jobStore.create({ config: {} });
            await jobStore.get('job_123');
            await jobStore.getAll();

            // openDB should only be called once
            expect(openDB).toHaveBeenCalledTimes(1);
        });
    });
});
