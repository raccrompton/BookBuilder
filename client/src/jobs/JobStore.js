/**
 * =============================================================================
 * JobStore.js - IndexedDB Persistence for Analysis Jobs
 * =============================================================================
 *
 * PURPOSE:
 * Provides persistent storage for analysis jobs using IndexedDB. Jobs survive
 * page refreshes and browser restarts, enabling recovery from interruptions.
 *
 * HOW IT FITS IN:
 * - Used by: JobManager (manages job lifecycle and state transitions)
 * - Depends on: idb library (Promise-based IndexedDB wrapper)
 *
 * KEY CONCEPTS:
 * - IndexedDB: Browser-native async key-value database that persists locally
 * - Object stores: Like tables in a database - we use one called "jobs"
 * - Indexes: Allow querying by fields other than the primary key (e.g., status)
 */

import { openDB } from 'idb';

// Database configuration constants
const DB_NAME = 'bookbuilder';      // Name of our IndexedDB database
const DB_VERSION = 1;                // Schema version - increment when structure changes
const STORE_NAME = 'jobs';           // Object store name (like a table)

/**
 * Job status constants - using an object for type safety and autocomplete
 * These represent the possible states a job can be in
 */
export const JOB_STATUS = {
    PENDING: 'pending',       // Job created but not yet started
    RUNNING: 'running',       // Job is currently being processed
    COMPLETED: 'completed',   // Job finished successfully
    FAILED: 'failed',         // Job encountered an error
    CANCELLED: 'cancelled'    // Job was manually cancelled
};

/**
 * JobStore - Handles persistent storage of analysis jobs in IndexedDB
 *
 * WHAT IT DOES:
 * Provides CRUD (Create, Read, Update, Delete) operations for job records,
 * with support for querying by status and automatic cleanup of old jobs.
 *
 * EXAMPLE USAGE:
 * const store = new JobStore();
 * const job = await store.create({ config: { pgn: '1. e4' } });
 * await store.update(job.id, { status: 'running' });
 * const runningJobs = await store.getByStatus('running');
 */
export class JobStore {
    constructor() {
        // Lazy-initialized database connection - created on first use
        this.dbPromise = null;
    }

    /**
     * Gets or creates the database connection.
     *
     * HOW IT WORKS:
     * Uses lazy initialization - the database is only opened when first needed,
     * then the same connection is reused for all subsequent operations.
     * This is more efficient than opening a new connection for each operation.
     *
     * @returns {Promise<IDBDatabase>} The database connection
     * @private
     */
    async _getDb() {
        if (!this.dbPromise) {
            // Open database and create schema if needed
            this.dbPromise = openDB(DB_NAME, DB_VERSION, {
                // upgrade() is called when database is created or version increases
                upgrade(db) {
                    // Check if object store already exists (prevents errors on re-open)
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        // Create the jobs object store with 'id' as the primary key
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

                        // Create indexes for common queries
                        store.createIndex('status', 'status');       // Query by job status
                        store.createIndex('createdAt', 'createdAt'); // Query by creation time
                    }
                }
            });
        }
        return this.dbPromise;
    }

    /**
     * Creates a new job record in the database.
     *
     * WHAT IT DOES:
     * Takes job data, adds generated ID and timestamps, then saves to IndexedDB.
     *
     * @param {Object} job - Initial job data
     * @param {string} [job.id] - Optional custom ID (generated if not provided)
     * @param {Object} job.config - Job configuration (PGN, depth, format, etc.)
     * @returns {Promise<Object>} The created job record with all fields populated
     *
     * EXAMPLE:
     * const job = await store.create({
     *     config: { pgn: '1. e4 c5', depth: 15, format: 'tree' }
     * });
     * // job.id -> 'job_1703500000000_abc123'
     * // job.status -> 'pending'
     */
    async create(job) {
        const db = await this._getDb();
        const now = Date.now();

        // Build the complete job record with defaults
        const record = {
            ...job,
            // Generate unique ID if not provided: job_timestamp_randomString
            id: job.id || `job_${now}_${Math.random().toString(36).substr(2, 9)}`,
            status: JOB_STATUS.PENDING,  // All new jobs start as pending
            progress: null,               // No progress yet
            result: null,                  // No result yet
            error: null,                   // No error yet
            createdAt: now,
            updatedAt: now
        };

        // Save to database using put() - creates or updates
        await db.put(STORE_NAME, record);
        return record;
    }

    /**
     * Retrieves a job by its ID.
     *
     * @param {string} id - The job ID to look up
     * @returns {Promise<Object|undefined>} The job record, or undefined if not found
     *
     * EXAMPLE:
     * const job = await store.get('job_123');
     * if (job) {
     *     console.log(job.status); // 'running'
     * }
     */
    async get(id) {
        const db = await this._getDb();
        return db.get(STORE_NAME, id);
    }

    /**
     * Updates an existing job with new data.
     *
     * WHAT IT DOES:
     * Merges the update data with the existing job record, updates the
     * timestamp, and saves back to the database.
     *
     * @param {string} id - The job ID to update
     * @param {Object} updates - Fields to update (merged with existing)
     * @returns {Promise<Object>} The updated job record
     * @throws {Error} If the job doesn't exist
     *
     * EXAMPLE:
     * await store.update('job_123', {
     *     status: 'running',
     *     progress: { currentLine: 5, totalLines: 20 }
     * });
     */
    async update(id, updates) {
        const db = await this._getDb();

        // First, get the existing job
        const existing = await db.get(STORE_NAME, id);
        if (!existing) {
            throw new Error(`Job ${id} not found`);
        }

        // Merge updates with existing data, update timestamp
        const updated = {
            ...existing,
            ...updates,
            updatedAt: Date.now()
        };

        await db.put(STORE_NAME, updated);
        return updated;
    }

    /**
     * Deletes a job by its ID.
     *
     * @param {string} id - The job ID to delete
     * @returns {Promise<void>}
     */
    async delete(id) {
        const db = await this._getDb();
        await db.delete(STORE_NAME, id);
    }

    /**
     * Gets all jobs with a specific status.
     *
     * HOW IT WORKS:
     * Uses the 'status' index we created during database setup.
     * Indexes make these queries fast even with many jobs.
     *
     * @param {string} status - Status to filter by ('pending', 'running', etc.)
     * @returns {Promise<Array>} Array of matching job records
     *
     * EXAMPLE:
     * const completedJobs = await store.getByStatus('completed');
     */
    async getByStatus(status) {
        const db = await this._getDb();
        return db.getAllFromIndex(STORE_NAME, 'status', status);
    }

    /**
     * Gets the currently running job, if any.
     *
     * WHAT IT DOES:
     * Convenience method to find if there's an active analysis running.
     * Returns the first running job (there should typically be at most one).
     *
     * @returns {Promise<Object|null>} The running job, or null if none
     */
    async getInProgress() {
        const running = await this.getByStatus(JOB_STATUS.RUNNING);
        return running[0] || null;
    }

    /**
     * Gets all jobs regardless of status.
     *
     * @returns {Promise<Array>} All job records
     */
    async getAll() {
        const db = await this._getDb();
        return db.getAll(STORE_NAME);
    }

    /**
     * Removes old completed jobs to prevent database bloat.
     *
     * HOW IT WORKS:
     * Iterates through all jobs and deletes those that are:
     * 1. Older than the threshold
     * 2. NOT in 'running' status (never delete in-progress work)
     *
     * @param {number} [olderThanMs=86400000] - Age threshold in milliseconds (default: 24 hours)
     * @returns {Promise<void>}
     *
     * EXAMPLE:
     * // Clean up jobs older than 12 hours
     * await store.cleanup(12 * 60 * 60 * 1000);
     */
    async cleanup(olderThanMs = 24 * 60 * 60 * 1000) {
        const db = await this._getDb();
        const cutoff = Date.now() - olderThanMs;

        // Use a transaction for atomic cleanup
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        // Iterate through all jobs with a cursor
        let cursor = await store.openCursor();
        while (cursor) {
            const job = cursor.value;
            // Delete if old enough AND not currently running
            if (job.createdAt < cutoff && job.status !== JOB_STATUS.RUNNING) {
                await cursor.delete();
            }
            cursor = await cursor.continue();
        }
    }
}
