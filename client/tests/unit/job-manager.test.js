/**
 * =============================================================================
 * job-manager.test.js - Unit Tests for JobManager
 * =============================================================================
 *
 * PURPOSE:
 * Tests the JobManager class which orchestrates job lifecycle with a state machine.
 * Ensures valid state transitions and cross-tab synchronization.
 *
 * KEY CONCEPTS:
 * - State Machine: Enforces valid transitions between job statuses
 * - BroadcastChannel: Browser API for cross-tab communication
 * - Pub/Sub: Pattern where listeners subscribe to events and get notified
 */

// Mock JobStore
jest.mock('../../src/jobs/JobStore.js', () => ({
    JobStore: jest.fn().mockImplementation(() => ({
        create: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        getByStatus: jest.fn(),
        getInProgress: jest.fn(),
        getAll: jest.fn(),
        cleanup: jest.fn(),
    })),
    JOB_STATUS: {
        PENDING: 'pending',
        RUNNING: 'running',
        COMPLETED: 'completed',
        FAILED: 'failed',
        CANCELLED: 'cancelled'
    }
}));

// Mock BroadcastChannel
class MockBroadcastChannel {
    constructor(name) {
        this.name = name;
        this.onmessage = null;
        MockBroadcastChannel.instances.push(this);
    }
    postMessage(message) {
        // Simulate broadcasting to other tabs
        MockBroadcastChannel.lastMessage = message;
    }
    close() {}
}
MockBroadcastChannel.instances = [];
MockBroadcastChannel.lastMessage = null;

global.BroadcastChannel = MockBroadcastChannel;

import { JobManager, VALID_TRANSITIONS } from '../../src/jobs/JobManager.js';
import { JobStore, JOB_STATUS } from '../../src/jobs/JobStore.js';

describe('JobManager', () => {
    let jobManager;
    let mockStore;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        MockBroadcastChannel.instances = [];
        MockBroadcastChannel.lastMessage = null;

        // Create fresh JobManager
        jobManager = new JobManager();
        mockStore = jobManager.store;
    });

    describe('VALID_TRANSITIONS', () => {
        test('pending can transition to running or cancelled', () => {
            expect(VALID_TRANSITIONS.pending).toContain('running');
            expect(VALID_TRANSITIONS.pending).toContain('cancelled');
            expect(VALID_TRANSITIONS.pending).not.toContain('completed');
        });

        test('running can transition to completed, failed, or cancelled', () => {
            expect(VALID_TRANSITIONS.running).toContain('completed');
            expect(VALID_TRANSITIONS.running).toContain('failed');
            expect(VALID_TRANSITIONS.running).toContain('cancelled');
        });

        test('terminal states cannot transition', () => {
            expect(VALID_TRANSITIONS.completed).toEqual([]);
            expect(VALID_TRANSITIONS.failed).toEqual([]);
            expect(VALID_TRANSITIONS.cancelled).toEqual([]);
        });
    });

    describe('createJob()', () => {
        test('creates a new job with config', async () => {
            const config = { pgn: '1. e4 c5', depth: 15 };
            const mockJob = {
                id: 'job_123',
                config,
                status: 'pending',
                createdAt: Date.now()
            };
            mockStore.create.mockResolvedValue(mockJob);
            mockStore.getInProgress.mockResolvedValue(null);

            const job = await jobManager.createJob(config);

            expect(job).toEqual(mockJob);
            expect(mockStore.create).toHaveBeenCalledWith({ config });
        });

        test('cancels existing running job before creating new one', async () => {
            const existingJob = { id: 'old_job', status: 'running' };
            const newJob = { id: 'new_job', status: 'pending', config: {} };

            mockStore.getInProgress.mockResolvedValue(existingJob);
            mockStore.get.mockResolvedValue(existingJob);
            mockStore.update.mockResolvedValue({ ...existingJob, status: 'cancelled' });
            mockStore.create.mockResolvedValue(newJob);

            await jobManager.createJob({});

            // Should have updated old job to cancelled
            expect(mockStore.update).toHaveBeenCalledWith('old_job', expect.objectContaining({
                status: 'cancelled'
            }));
        });

        test('broadcasts JOB_CREATED event', async () => {
            const mockJob = { id: 'job_123', status: 'pending' };
            mockStore.create.mockResolvedValue(mockJob);
            mockStore.getInProgress.mockResolvedValue(null);

            await jobManager.createJob({});

            expect(MockBroadcastChannel.lastMessage).toEqual({
                type: 'JOB_CREATED',
                job: mockJob
            });
        });
    });

    describe('transition()', () => {
        test('allows valid transitions', async () => {
            const job = { id: 'job_123', status: 'pending' };
            const updatedJob = { ...job, status: 'running' };

            mockStore.get.mockResolvedValue(job);
            mockStore.update.mockResolvedValue(updatedJob);

            const result = await jobManager.transition('job_123', 'running');

            expect(result.status).toBe('running');
            expect(mockStore.update).toHaveBeenCalledWith('job_123', expect.objectContaining({
                status: 'running'
            }));
        });

        test('rejects invalid transitions', async () => {
            const job = { id: 'job_123', status: 'completed' };
            mockStore.get.mockResolvedValue(job);

            await expect(jobManager.transition('job_123', 'running'))
                .rejects
                .toThrow('Invalid transition: completed → running');
        });

        test('throws error for non-existent job', async () => {
            mockStore.get.mockResolvedValue(undefined);

            await expect(jobManager.transition('non-existent', 'running'))
                .rejects
                .toThrow('Job non-existent not found');
        });

        test('accepts additional data with transition', async () => {
            const job = { id: 'job_123', status: 'running' };
            const result = { pgn: 'result pgn' };
            mockStore.get.mockResolvedValue(job);
            mockStore.update.mockResolvedValue({ ...job, status: 'completed', result });

            await jobManager.transition('job_123', 'completed', { result });

            expect(mockStore.update).toHaveBeenCalledWith('job_123', expect.objectContaining({
                status: 'completed',
                result
            }));
        });

        test('broadcasts status change event', async () => {
            const job = { id: 'job_123', status: 'running' };
            const updatedJob = { ...job, status: 'completed' };
            mockStore.get.mockResolvedValue(job);
            mockStore.update.mockResolvedValue(updatedJob);

            await jobManager.transition('job_123', 'completed');

            expect(MockBroadcastChannel.lastMessage).toEqual({
                type: 'JOB_COMPLETED',
                job: updatedJob
            });
        });
    });

    describe('updateProgress()', () => {
        test('updates job progress without changing status', async () => {
            const progress = { currentLine: 5, totalLines: 20 };
            const updatedJob = { id: 'job_123', status: 'running', progress };
            mockStore.update.mockResolvedValue(updatedJob);

            const result = await jobManager.updateProgress('job_123', progress);

            expect(result.progress).toEqual(progress);
            expect(mockStore.update).toHaveBeenCalledWith('job_123', { progress });
        });

        test('broadcasts JOB_PROGRESS event', async () => {
            const progress = { currentLine: 5 };
            const updatedJob = { id: 'job_123', progress };
            mockStore.update.mockResolvedValue(updatedJob);

            await jobManager.updateProgress('job_123', progress);

            expect(MockBroadcastChannel.lastMessage).toEqual({
                type: 'JOB_PROGRESS',
                job: updatedJob
            });
        });
    });

    describe('getInProgress()', () => {
        test('returns running job from store', async () => {
            const runningJob = { id: 'job_123', status: 'running' };
            mockStore.getInProgress.mockResolvedValue(runningJob);

            const result = await jobManager.getInProgress();

            expect(result).toEqual(runningJob);
        });

        test('returns null when no job is running', async () => {
            mockStore.getInProgress.mockResolvedValue(null);

            const result = await jobManager.getInProgress();

            expect(result).toBeNull();
        });
    });

    describe('subscribe()', () => {
        test('adds listener for job events', async () => {
            const listener = jest.fn();
            jobManager.subscribe(listener);

            // Trigger an event
            const mockJob = { id: 'job_123', status: 'pending' };
            mockStore.create.mockResolvedValue(mockJob);
            mockStore.getInProgress.mockResolvedValue(null);
            await jobManager.createJob({});

            expect(listener).toHaveBeenCalledWith({
                type: 'JOB_CREATED',
                job: mockJob
            });
        });

        test('returns unsubscribe function', async () => {
            const listener = jest.fn();
            const unsubscribe = jobManager.subscribe(listener);

            unsubscribe();

            // Trigger an event
            const mockJob = { id: 'job_123', status: 'pending' };
            mockStore.create.mockResolvedValue(mockJob);
            mockStore.getInProgress.mockResolvedValue(null);
            await jobManager.createJob({});

            expect(listener).not.toHaveBeenCalled();
        });

        test('handles multiple listeners', async () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            jobManager.subscribe(listener1);
            jobManager.subscribe(listener2);

            const mockJob = { id: 'job_123', status: 'pending' };
            mockStore.create.mockResolvedValue(mockJob);
            mockStore.getInProgress.mockResolvedValue(null);
            await jobManager.createJob({});

            expect(listener1).toHaveBeenCalled();
            expect(listener2).toHaveBeenCalled();
        });

        test('continues notifying other listeners if one throws', async () => {
            const errorListener = jest.fn().mockImplementation(() => {
                throw new Error('Listener error');
            });
            const goodListener = jest.fn();

            jobManager.subscribe(errorListener);
            jobManager.subscribe(goodListener);

            const mockJob = { id: 'job_123', status: 'pending' };
            mockStore.create.mockResolvedValue(mockJob);
            mockStore.getInProgress.mockResolvedValue(null);

            // Should not throw
            await jobManager.createJob({});

            expect(goodListener).toHaveBeenCalled();
        });
    });

    describe('BroadcastChannel integration', () => {
        test('creates channel with correct name', () => {
            expect(MockBroadcastChannel.instances.length).toBe(1);
            expect(MockBroadcastChannel.instances[0].name).toBe('bookbuilder-jobs');
        });

        test('receives messages from other tabs', () => {
            const listener = jest.fn();
            jobManager.subscribe(listener);

            // Simulate message from another tab
            const message = { type: 'JOB_COMPLETED', job: { id: 'job_123' } };
            MockBroadcastChannel.instances[0].onmessage({ data: message });

            expect(listener).toHaveBeenCalledWith(message);
        });
    });

    describe('cancelJob()', () => {
        test('transitions job to cancelled', async () => {
            const job = { id: 'job_123', status: 'running' };
            const cancelledJob = { ...job, status: 'cancelled' };
            mockStore.get.mockResolvedValue(job);
            mockStore.update.mockResolvedValue(cancelledJob);

            const result = await jobManager.cancelJob('job_123');

            expect(result.status).toBe('cancelled');
        });

        test('handles already cancelled jobs gracefully', async () => {
            const job = { id: 'job_123', status: 'cancelled' };
            mockStore.get.mockResolvedValue(job);

            // Should not throw, just return the already cancelled job
            await expect(jobManager.cancelJob('job_123'))
                .rejects
                .toThrow('Invalid transition');
        });
    });

    describe('getJob()', () => {
        test('retrieves job by ID', async () => {
            const job = { id: 'job_123', status: 'running' };
            mockStore.get.mockResolvedValue(job);

            const result = await jobManager.getJob('job_123');

            expect(result).toEqual(job);
            expect(mockStore.get).toHaveBeenCalledWith('job_123');
        });
    });
});
