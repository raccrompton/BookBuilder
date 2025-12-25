/**
 * =============================================================================
 * JobManager.js - Job Lifecycle State Machine
 * =============================================================================
 *
 * PURPOSE:
 * Orchestrates job lifecycle with a state machine pattern. Ensures only valid
 * state transitions occur and broadcasts changes to all open tabs.
 *
 * HOW IT FITS IN:
 * - Used by: FormController (manages UI and analysis workflow)
 * - Depends on: JobStore (persistent storage), BroadcastChannel (cross-tab sync)
 *
 * KEY CONCEPTS:
 * - State Machine: Jobs can only transition between predefined valid states
 * - BroadcastChannel: Browser API that sends messages to all tabs on same origin
 * - Pub/Sub: Listeners subscribe to events and get notified of changes
 *
 * STATE DIAGRAM:
 *                     ┌─────────────────────────────────┐
 *                     │                                 │
 *                     ▼                                 │
 * ┌─────────┐    ┌─────────┐    ┌───────────┐         │
 * │ pending │───►│ running │───►│ completed │         │
 * └─────────┘    └─────────┘    └───────────┘         │
 *      │              │                                │
 *      │              │         ┌────────┐            │
 *      │              └────────►│ failed │            │
 *      │              │         └────────┘            │
 *      │              │                                │
 *      │              │         ┌───────────┐         │
 *      └──────────────┴────────►│ cancelled │─────────┘
 *                               └───────────┘
 */

import { JobStore, JOB_STATUS } from './JobStore.js';

/**
 * Valid state transitions - defines which status changes are allowed
 * Terminal states (completed, failed, cancelled) have no valid transitions
 */
export const VALID_TRANSITIONS = {
    'pending': ['running', 'cancelled'],
    'running': ['completed', 'failed', 'cancelled'],
    'completed': [],  // Terminal state - no transitions allowed
    'failed': [],     // Terminal state - no transitions allowed
    'cancelled': []   // Terminal state - no transitions allowed
};

/**
 * JobManager - Orchestrates job lifecycle with state machine and cross-tab sync
 *
 * WHAT IT DOES:
 * - Creates and manages analysis jobs
 * - Enforces valid state transitions
 * - Broadcasts changes to all browser tabs
 * - Allows UI components to subscribe to job events
 *
 * EXAMPLE USAGE:
 * const manager = new JobManager();
 *
 * // Subscribe to events
 * manager.subscribe((event) => {
 *     console.log(`${event.type}: Job ${event.job.id}`);
 * });
 *
 * // Create and run a job
 * const job = await manager.createJob({ pgn: '1. e4' });
 * await manager.transition(job.id, 'running');
 * await manager.updateProgress(job.id, { currentLine: 5 });
 * await manager.transition(job.id, 'completed', { result: {...} });
 */
export class JobManager {
    constructor() {
        // JobStore handles persistence to IndexedDB
        this.store = new JobStore();

        // Set of callback functions listening for job events
        this.listeners = new Set();

        // BroadcastChannel for cross-tab communication
        // All tabs on the same origin receive messages
        this.channel = new BroadcastChannel('bookbuilder-jobs');

        // When a message arrives from another tab, notify our listeners
        this.channel.onmessage = (event) => {
            this._notifyListeners(event.data);
        };
    }

    /**
     * Creates a new job and cancels any existing running job.
     *
     * WHAT IT DOES:
     * 1. Checks if there's already a running job
     * 2. If so, cancels it (can't have two jobs running at once)
     * 3. Creates the new job with 'pending' status
     * 4. Broadcasts JOB_CREATED event
     *
     * @param {Object} config - Job configuration (PGN, depth, format, etc.)
     * @returns {Promise<Object>} The created job record
     */
    async createJob(config) {
        // Cancel any existing running job first
        const existing = await this.store.getInProgress();
        if (existing) {
            await this.transition(existing.id, 'cancelled');
        }

        // Create the new job
        const job = await this.store.create({ config });

        // Broadcast to all tabs
        this._broadcast({ type: 'JOB_CREATED', job });

        return job;
    }

    /**
     * Transitions a job to a new status with validation.
     *
     * WHAT IT DOES:
     * 1. Retrieves the current job state
     * 2. Validates the transition is allowed
     * 3. Updates the job in the store
     * 4. Broadcasts the status change event
     *
     * @param {string} jobId - ID of the job to transition
     * @param {string} newStatus - Target status ('running', 'completed', etc.)
     * @param {Object} [data={}] - Additional data to store (result, error, etc.)
     * @returns {Promise<Object>} The updated job record
     * @throws {Error} If job not found or transition is invalid
     */
    async transition(jobId, newStatus, data = {}) {
        // Get current job state
        const job = await this.store.get(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }

        // Validate the transition is allowed
        const allowed = VALID_TRANSITIONS[job.status];
        if (!allowed.includes(newStatus)) {
            throw new Error(`Invalid transition: ${job.status} → ${newStatus}`);
        }

        // Update the job with new status and any additional data
        const updates = { status: newStatus, ...data };
        const updated = await this.store.update(jobId, updates);

        // Broadcast event with status-specific type (e.g., JOB_COMPLETED)
        this._broadcast({
            type: `JOB_${newStatus.toUpperCase()}`,
            job: updated
        });

        return updated;
    }

    /**
     * Updates job progress without changing status.
     *
     * @param {string} jobId - ID of the job to update
     * @param {Object} progress - Progress data (currentLine, totalLines, etc.)
     * @returns {Promise<Object>} The updated job record
     */
    async updateProgress(jobId, progress) {
        const updated = await this.store.update(jobId, { progress });

        this._broadcast({ type: 'JOB_PROGRESS', job: updated });

        return updated;
    }

    /**
     * Gets the currently running job, if any.
     *
     * @returns {Promise<Object|null>} The running job, or null if none
     */
    async getInProgress() {
        return this.store.getInProgress();
    }

    /**
     * Gets a job by its ID.
     *
     * @param {string} jobId - The job ID
     * @returns {Promise<Object|undefined>} The job, or undefined if not found
     */
    async getJob(jobId) {
        return this.store.get(jobId);
    }

    /**
     * Cancels a job (convenience method for transition to 'cancelled').
     *
     * @param {string} jobId - ID of the job to cancel
     * @returns {Promise<Object>} The cancelled job record
     */
    async cancelJob(jobId) {
        return this.transition(jobId, 'cancelled');
    }

    /**
     * Subscribes to job events.
     *
     * HOW IT WORKS:
     * Adds your callback to the set of listeners. Your callback will be
     * called whenever a job event occurs (created, status change, progress).
     *
     * @param {Function} callback - Function called with event object { type, job }
     * @returns {Function} Unsubscribe function - call it to stop receiving events
     *
     * EXAMPLE:
     * const unsubscribe = manager.subscribe((event) => {
     *     if (event.type === 'JOB_COMPLETED') {
     *         displayResults(event.job.result);
     *     }
     * });
     *
     * // Later, to stop listening:
     * unsubscribe();
     */
    subscribe(callback) {
        this.listeners.add(callback);

        // Return unsubscribe function
        return () => this.listeners.delete(callback);
    }

    /**
     * Broadcasts a message to all tabs and local listeners.
     *
     * @param {Object} message - Event object to broadcast { type, job }
     * @private
     */
    _broadcast(message) {
        // Send to other tabs via BroadcastChannel
        this.channel.postMessage(message);

        // Notify local listeners
        this._notifyListeners(message);
    }

    /**
     * Notifies all local listeners of an event.
     *
     * @param {Object} message - Event object { type, job }
     * @private
     */
    _notifyListeners(message) {
        this.listeners.forEach(callback => {
            try {
                callback(message);
            } catch (error) {
                // Log error but don't let one bad listener break others
                console.error('Error in job event listener:', error);
            }
        });
    }
}
