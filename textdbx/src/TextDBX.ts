import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { EventEmitter } from 'events';

// Type definitions
interface DataRecord {
    [key: string]: string | number | boolean | DataRecord | DataRecord[] | null;
}

interface Query {
    collection: string;
    filter?: QueryFilter;
    fields?: string[];
    sort?: { [key: string]: 1 | -1 };
    limit?: number;
    skip?: number;
}

interface QueryFilter {
    $and?: QueryFilter[];
    $or?: QueryFilter[];
    $not?: QueryFilter;
    [key: string]: string | number | boolean | QueryFilter | QueryFilter[] | ComparisonOperators | undefined;
}

interface ComparisonOperators {
    $gt: number;
    $lt: number;
    $gte: number;
    $lte: number;
    $contains: string | number;
    $in: (string | number)[];
    $exists: boolean;
}

interface ConnectConfig {
    database: string;
    encryptionKey: string;
    mode: 'encrypted' | 'plain';
    role: string;
    maxCacheSize?: number;
    maxConnections?: number;
    queryTimeout?: number;
}

interface UserPermissions {
    [role: string]: string[];
}

interface Users {
    [username: string]: {
        role: string;
        passwordHash: string;
        salt: string;
    };
}

interface CacheEntry {
    data: DataRecord[];
    lastModified: number;
    accessCount: number;
    lastAccessed: number;
}

interface Transaction {
    id: string;
    operations: TransactionOperation[];
    backups: Map<string, DataRecord[]>;
    status: 'pending' | 'committed' | 'rolled_back';
}

interface TransactionOperation {
    type: 'insert' | 'update' | 'delete';
    collection: string;
    data?: DataRecord;
    filter?: QueryFilter;
    changes?: Partial<DataRecord>;
}

interface AggregationStage {
    $match?: QueryFilter;
    $group?: GroupStage;
    $sort?: { [key: string]: 1 | -1 };
    $limit?: number;
    $skip?: number;
}

interface GroupStage {
    _id: { [key: string]: string } | null;
    [key: string]: GroupOperator | { [key: string]: string } | null;
}

interface GroupOperator {
    $sum?: string | number;
    $avg?: string;
    $count?: boolean;
    $min?: string;
    $max?: string;
}

interface IndexEntry {
    [value: string]: number[];
}

interface ValidationError extends Error {
    field?: string;
    value?: unknown;
}

// Custom errors
class TextDBXError extends Error {
    constructor(message: string, public code: string, public details?: Record<string, unknown>) {
        super(message);
        this.name = 'TextDBXError';
    }
}

class ValidationError extends TextDBXError {
    constructor(message: string, field?: string, value?: unknown) {
        super(message, 'VALIDATION_ERROR', { field, value });
        this.name = 'ValidationError';
    }
}

class PermissionError extends TextDBXError {
    constructor(action: string, role: string) {
        super(`Permission denied for action '${action}' with role '${role}'`, 'PERMISSION_DENIED', { action, role });
        this.name = 'PermissionError';
    }
}

class TransactionError extends TextDBXError {
    constructor(message: string, transactionId: string) {
        super(message, 'TRANSACTION_ERROR', { transactionId });
        this.name = 'TransactionError';
    }
}

// Connection pool for managing concurrent access
class ConnectionPool extends EventEmitter {
    private activeConnections = 0;
    private waitingQueue: Array<(connection: Connection) => void> = [];
    
    constructor(private maxConnections: number = 10) {
        super();
    }

    async acquireConnection(): Promise<Connection> {
        return new Promise((resolve) => {
            if (this.activeConnections < this.maxConnections) {
                this.activeConnections++;
                const connection = new Connection(() => this.releaseConnection());
                resolve(connection);
            } else {
                this.waitingQueue.push(resolve);
            }
        });
    }

    private releaseConnection(): void {
        this.activeConnections--;
        if (this.waitingQueue.length > 0) {
            const next = this.waitingQueue.shift();
            if (next) {
                this.activeConnections++;
                const connection = new Connection(() => this.releaseConnection());
                next(connection);
            }
        }
    }

    getStats(): { active: number; waiting: number; max: number } {
        return {
            active: this.activeConnections,
            waiting: this.waitingQueue.length,
            max: this.maxConnections
        };
    }
}

class Connection {
    constructor(private releaseCallback: () => void) {}

    release(): void {
        this.releaseCallback();
    }
}

export class TextDBX {
    private config: ConnectConfig;
    private users: Users = {};
    private auth: UserPermissions = {};
    private queryPatterns: { [collection: string]: { [field: string]: number } } = {};
    private cache = new Map<string, CacheEntry>();
    private indexes = new Map<string, IndexEntry>();
    private activeTransactions = new Map<string, Transaction>();
    private connectionPool: ConnectionPool;
    private fileLocks = new Map<string, Promise<void>>();

    constructor(connectPath: string) {
        try {
            const cfg = this.loadConfig(connectPath);
            this.config = cfg;
            this.connectionPool = new ConnectionPool(cfg.maxConnections || 10);
            this.loadUsersAndAuth();
            this.initializeDatabase();
        } catch (error) {
            throw new TextDBXError(
                `Failed to initialize TextDBX: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'INITIALIZATION_ERROR'
            );
        }
    }

    private loadConfig(file: string): ConnectConfig {
        try {
            if (!fs.existsSync(file)) {
                throw new ValidationError(`Config file not found: ${file}`);
            }

            const lines = fs.readFileSync(file, 'utf8').split('\n');
            const cfg: Record<string, string> = {};
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine.startsWith('#')) continue;
                
                const [key, ...valueParts] = trimmedLine.split('=');
                if (key && valueParts.length > 0) {
                    cfg[key.trim()] = valueParts.join('=').trim();
                }
            }

            this.validateConfig(cfg);
            
            return {
                database: cfg.database,
                encryptionKey: cfg.encryptionKey,
                mode: cfg.mode as 'encrypted' | 'plain',
                role: cfg.role,
                maxCacheSize: parseInt(cfg.maxCacheSize || '100'),
                maxConnections: parseInt(cfg.maxConnections || '10'),
                queryTimeout: parseInt(cfg.queryTimeout || '30000')
            };
        } catch (error) {
            throw new TextDBXError(
                `Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'CONFIG_ERROR'
            );
        }
    }

    private validateConfig(cfg: Record<string, string>): void {
        const required = ['database', 'encryptionKey', 'mode', 'role'];
        for (const field of required) {
            if (!cfg[field]) {
                throw new ValidationError(`Missing required config field: ${field}`);
            }
        }

        if (!['encrypted', 'plain'].includes(cfg.mode)) {
            throw new ValidationError(`Invalid mode: ${cfg.mode}. Must be 'encrypted' or 'plain'`);
        }

        if (cfg.encryptionKey.length < 32) {
            throw new ValidationError('Encryption key must be at least 32 characters long');
        }
    }

    private initializeDatabase(): void {
        try {
            if (!fs.existsSync(this.config.database)) {
                fs.mkdirSync(this.config.database, { recursive: true });
            }

            // Validate database directory is writable
            const testFile = path.join(this.config.database, '.test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (error) {
            throw new TextDBXError(
                `Database directory is not accessible: ${this.config.database}`,
                'DATABASE_ACCESS_ERROR'
            );
        }
    }

    private validateCollectionName(collection: string): void {
        if (!collection || typeof collection !== 'string') {
            throw new ValidationError('Collection name must be a non-empty string');
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(collection)) {
            throw new ValidationError(
                'Collection name can only contain letters, numbers, underscores, and hyphens',
                'collection',
                collection
            );
        }

        if (collection.length > 64) {
            throw new ValidationError('Collection name cannot exceed 64 characters');
        }

        if (collection.startsWith('.')) {
            throw new ValidationError('Collection name cannot start with a dot');
        }
    }

    private getCollectionPath(collection: string): string {
        this.validateCollectionName(collection);
        return path.join(this.config.database, `${collection}.tdbx`);
    }

    private deriveKey(password: string, salt: Buffer): Buffer {
        return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    }

    private encrypt(data: string): string {
        try {
            const salt = crypto.randomBytes(16);
            const key = this.deriveKey(this.config.encryptionKey, salt);
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            
            const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
            return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted.toString('hex');
        } catch (error) {
            throw new TextDBXError(
                `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'ENCRYPTION_ERROR'
            );
        }
    }

    private decrypt(data: string): string {
        try {
            const [saltHex, ivHex, encHex] = data.split(':');
            if (!saltHex || !ivHex || !encHex) {
                throw new Error('Invalid encrypted data format');
            }

            const salt = Buffer.from(saltHex, 'hex');
            const iv = Buffer.from(ivHex, 'hex');
            const encrypted = Buffer.from(encHex, 'hex');
            const key = this.deriveKey(this.config.encryptionKey, salt);
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            return decrypted.toString('utf8');
        } catch (error) {
            throw new TextDBXError(
                `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'DECRYPTION_ERROR'
            );
        }
    }

    private async withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
        const lockKey = filePath;
        
        // Wait for any existing lock on this file
        while (this.fileLocks.has(lockKey)) {
            await this.fileLocks.get(lockKey);
        }

        // Create new lock
        let resolveLock: () => void;
        const lockPromise = new Promise<void>((resolve) => {
            resolveLock = resolve;
        });
        this.fileLocks.set(lockKey, lockPromise);

        try {
            const result = await operation();
            return result;
        } finally {
            this.fileLocks.delete(lockKey);
            resolveLock!();
        }
    }

    private async loadFile(collection: string): Promise<DataRecord[]> {
        const cacheKey = collection;
        const cached = this.cache.get(cacheKey);
        const filePath = this.getCollectionPath(collection);

        try {
            if (!fs.existsSync(filePath)) {
                return [];
            }

            const stats = fs.statSync(filePath);
            const lastModified = stats.mtime.getTime();

            // Check cache validity
            if (cached && cached.lastModified >= lastModified) {
                cached.accessCount++;
                cached.lastAccessed = Date.now();
                return cached.data;
            }

            // Load from file
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const json = this.config.mode === 'encrypted' ? this.decrypt(raw) : raw;
            
            let data: DataRecord[];
            try {
                data = JSON.parse(json) as DataRecord[];
            } catch (parseError) {
                throw new TextDBXError(
                    `Invalid JSON in collection file: ${collection}`,
                    'DATA_CORRUPTION_ERROR'
                );
            }

            // Validate data structure
            if (!Array.isArray(data)) {
                throw new TextDBXError(
                    `Collection data must be an array: ${collection}`,
                    'DATA_FORMAT_ERROR'
                );
            }

            // Update cache
            this.updateCache(cacheKey, data, lastModified);
            return data;
        } catch (error) {
            if (error instanceof TextDBXError) {
                throw error;
            }
            throw new TextDBXError(
                `Failed to load collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
                'FILE_READ_ERROR'
            );
        }
    }

    private async saveFile(collection: string, data: DataRecord[]): Promise<void> {
        const filePath = this.getCollectionPath(collection);
        
        return this.withFileLock(filePath, async () => {
            try {
                const json = JSON.stringify(data, null, 2);
                const raw = this.config.mode === 'encrypted' ? this.encrypt(json) : json;
                
                // Write to temporary file first
                const tempPath = filePath + '.tmp';
                await fs.promises.writeFile(tempPath, raw, 'utf8');
                
                // Atomic rename
                await fs.promises.rename(tempPath, filePath);
                
                // Update cache
                this.updateCache(collection, data, Date.now());
            } catch (error) {
                throw new TextDBXError(
                    `Failed to save collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
                    'FILE_WRITE_ERROR'
                );
            }
        });
    }

    private updateCache(collection: string, data: DataRecord[], lastModified: number): void {
        // Implement LRU cache eviction
        if (this.cache.size >= (this.config.maxCacheSize || 100)) {
            const oldestKey = Array.from(this.cache.entries())
                .sort(([,a], [,b]) => a.lastAccessed - b.lastAccessed)[0][0];
            this.cache.delete(oldestKey);
        }

        this.cache.set(collection, {
            data: [...data], // Deep copy to prevent mutations
            lastModified,
            accessCount: 1,
            lastAccessed: Date.now()
        });
    }

    private loadUsersAndAuth(): void {
        try {
            const usersPath = path.join(this.config.database, '.users');
            const authPath = path.join(this.config.database, '.auth');
            
            if (fs.existsSync(usersPath)) {
                const usersData = fs.readFileSync(usersPath, 'utf8');
                this.users = JSON.parse(usersData) as Users;
            }
            
            if (fs.existsSync(authPath)) {
                const authData = fs.readFileSync(authPath, 'utf8');
                this.auth = JSON.parse(authData) as UserPermissions;
            }
        } catch (error) {
            throw new TextDBXError(
                `Failed to load user data: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'USER_DATA_ERROR'
            );
        }
    }

    private checkPermission(action: string): void {
        const role = this.config.role;
        if (!this.auth[role] || !this.auth[role].includes(action)) {
            throw new PermissionError(action, role);
        }
    }

private matchFilter(row: DataRecord, filter?: QueryFilter): boolean {
    if (!filter) return true;
    try {
        // Handle logical operators
        if (filter.$and) {
            return filter.$and.every((f: QueryFilter) => this.matchFilter(row, f));
        }
        if (filter.$or) {
            return filter.$or.some((f: QueryFilter) => this.matchFilter(row, f));
        }
        if (filter.$not) {
            return !this.matchFilter(row, filter.$not);
        }
        
        // Handle comparison operators
        for (const key in filter) {
            if (key.startsWith('$')) continue; // Skip logical operators
            const filterValue = filter[key];
            const rowValue = row[key];
            
            if (typeof filterValue === 'object' && filterValue !== null && !Array.isArray(filterValue)) {
                const operators = filterValue as ComparisonOperators;
               
                for (const op in operators) {
                    const opValue = operators[op as keyof ComparisonOperators];
                    
                    // Add null/undefined check
                    if (opValue === undefined || opValue === null) {
                        throw new ValidationError(`Operator ${op} has undefined value`);
                    }
                   
                    switch (op) {
                        case '$gt':
                            if (typeof rowValue !== 'number' || typeof opValue !== 'number' || rowValue <= opValue) return false;
                            break;
                        case '$lt':
                            if (typeof rowValue !== 'number' || typeof opValue !== 'number' || rowValue >= opValue) return false;
                            break;
                        case '$gte':
                            if (typeof rowValue !== 'number' || typeof opValue !== 'number' || rowValue < opValue) return false;
                            break;
                        case '$lte':
                            if (typeof rowValue !== 'number' || typeof opValue !== 'number' || rowValue > opValue) return false;
                            break;
                        case '$contains':
                            // Check if rowValue is an array and contains opValue
                            if (Array.isArray(rowValue)) {
                                if (
                                    !(
                                        Array.isArray(rowValue) &&
                                        rowValue.every(item => typeof item === 'string' || typeof item === 'number') &&
                                        (rowValue as (string | number)[]).includes(opValue as string | number)
                                    )
                                ) return false;
                            } else if (typeof rowValue === 'string' && typeof opValue === 'string') {
                                // Handle string contains
                                if (!rowValue.includes(opValue)) return false;
                            } else {
                                return false; // rowValue is not array or string, can't contain anything
                            }
                            break;
                        case '$in':
                            if (!Array.isArray(opValue)) return false;
                            if (!opValue.includes(rowValue as string | number)) return false;
                            break;
                        case '$exists':
                            if (typeof opValue !== 'boolean' || (rowValue !== undefined) !== opValue) return false;
                            break;
                        default:
                            throw new ValidationError(`Unsupported operator: ${op}`);
                    }
                }
            } else if (rowValue !== filterValue) {
                return false;
            }
        }
        return true;
    } catch (error) {
        throw new TextDBXError(
            `Filter matching failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'FILTER_ERROR'
        );
    }
}

    private projectFields(row: DataRecord, fields?: string[]): DataRecord {
        if (!fields || fields.length === 0) return row;
        
        const projected: DataRecord = {};
        for (const field of fields) {
            if (field in row) {
                projected[field] = row[field];
            }
        }
        return projected;
    }

    // Transaction support
    public async beginTransaction(): Promise<string> {
        const transactionId = crypto.randomUUID();
        const transaction: Transaction = {
            id: transactionId,
            operations: [],
            backups: new Map(),
            status: 'pending'
        };
        
        this.activeTransactions.set(transactionId, transaction);
        return transactionId;
    }

    public async commitTransaction(transactionId: string): Promise<void> {
        const transaction = this.activeTransactions.get(transactionId);
        if (!transaction) {
            throw new TransactionError('Transaction not found', transactionId);
        }

        try {
            // Execute all operations
            for (const operation of transaction.operations) {
                await this.executeOperation(operation, transaction);
            }
            
            transaction.status = 'committed';
            this.activeTransactions.delete(transactionId);
        } catch (error) {
            await this.rollbackTransaction(transactionId);
            throw new TransactionError(
                `Transaction commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                transactionId
            );
        }
    }

    public async rollbackTransaction(transactionId: string): Promise<void> {
        const transaction = this.activeTransactions.get(transactionId);
        if (!transaction) {
            throw new TransactionError('Transaction not found', transactionId);
        }

        try {
            // Restore backups
            for (const [collection, backup] of transaction.backups) {
                await this.saveFile(collection, backup);
            }
            
            transaction.status = 'rolled_back';
            this.activeTransactions.delete(transactionId);
        } catch (error) {
            throw new TransactionError(
                `Transaction rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                transactionId
            );
        }
    }

    private async executeOperation(operation: TransactionOperation, transaction: Transaction): Promise<void> {
        // Create backup before operation
        if (!transaction.backups.has(operation.collection)) {
            const currentData = await this.loadFile(operation.collection);
            transaction.backups.set(operation.collection, [...currentData]);
        }

        switch (operation.type) {
            case 'insert':
                if (operation.data) {
                    await this.insertInternal(operation.collection, operation.data);
                }
                break;
            case 'update':
                if (operation.filter && operation.changes) {
                    await this.updateInternal(operation.collection, operation.filter, operation.changes);
                }
                break;
            case 'delete':
                if (operation.filter) {
                    await this.deleteInternal(operation.collection, operation.filter);
                }
                break;
        }
    }

    public async queryObject(query: Query): Promise<DataRecord[]> {
        this.checkPermission('query');
        
        const connection = await this.connectionPool.acquireConnection();
        try {
            // Track query patterns for auto-indexing
            if (!this.queryPatterns[query.collection]) {
                this.queryPatterns[query.collection] = {};
            }
            
            if (query.filter) {
                for (const key in query.filter) {
                    if (!key.startsWith('$')) {
                        this.queryPatterns[query.collection][key] = 
                            (this.queryPatterns[query.collection][key] || 0) + 1;
                    }
                }
            }

            // Auto-generate indexes for frequently queried fields
            for (const [field, count] of Object.entries(this.queryPatterns[query.collection])) {
                if (count > 5 && !this.hasIndex(query.collection, field)) {
                    await this.generateIndex(query.collection, field);
                }
            }

            let data = await this.loadFile(query.collection);

            // Apply filters
            if (query.filter) {
                data = data.filter(row => this.matchFilter(row, query.filter));
            }

            // Apply sorting
            if (query.sort) {
                data.sort((a, b) => {
                    for (const key in query.sort!) {
                        const aVal = a[key];
                        const bVal = b[key];
                        
                        if (aVal == null && bVal == null) continue;
                        if (aVal == null) return query.sort![key] === 1 ? -1 : 1;
                        if (bVal == null) return query.sort![key] === 1 ? 1 : -1;
                        if (aVal < bVal) return query.sort![key] === 1 ? -1 : 1;
                        if (aVal > bVal) return query.sort![key] === 1 ? 1 : -1;
                    }
                    return 0;
                });
            }

            // Apply pagination
            if (query.skip) data = data.slice(query.skip);
            if (query.limit) data = data.slice(0, query.limit);

            // Apply field projection
            return data.map(row => this.projectFields(row, query.fields));
        } finally {
            connection.release();
        }
    }

    public async aggregate(collection: string, pipeline: AggregationStage[]): Promise<DataRecord[]> {
        this.checkPermission('query');
        
        const connection = await this.connectionPool.acquireConnection();
        try {
            let data = await this.loadFile(collection);

            return pipeline.reduce((acc: DataRecord[], stage: AggregationStage) => {
                if (stage.$match) {
                    return acc.filter(row => this.matchFilter(row, stage.$match));
                }
                
                if (stage.$group) {
                    const groups: { [key: string]: DataRecord[] } = {};
                    
                    acc.forEach(row => {
                        let key = 'null';
                        if (stage.$group!._id) {
                            key = Object.entries(stage.$group!._id)
                                .map(([k, v]) => String(row[v] || row[k] || ''))
                                .join('-');
                        }

                        if (!groups[key]) groups[key] = [];
                        groups[key].push(row);
                    });

                    return Object.entries(groups).map(([key, rows]) => {
                        const result: DataRecord = { _id: key };
                        
                        for (const [k, v] of Object.entries(stage.$group!)) {
                            if (k === '_id') continue;
                            
                            const groupOp = v as GroupOperator;
                            if (groupOp.$sum !== undefined) {
                                if (typeof groupOp.$sum === 'number') {
                                    result[k] = groupOp.$sum * rows.length;
                                } else {
                                    result[k] = rows.reduce((sum, row) => {
                                        const val = row[groupOp.$sum as string];
                                        return sum + (typeof val === 'number' ? val : 0);
                                    }, 0);
                                }
                            }
                            if (groupOp.$avg && typeof groupOp.$avg === 'string') {
                                const sum = rows.reduce((sum, row) => {
                                    const val = row[groupOp.$avg as string];
                                    return sum + (typeof val === 'number' ? val : 0);
                                }, 0);
                                result[k] = sum / rows.length;
                            }
                            if (groupOp.$count) {
                                result[k] = rows.length;
                            }
                            if (groupOp.$min && typeof groupOp.$min === 'string') {
                                const values = rows.map(row => row[groupOp.$min as string])
                                    .filter(val => typeof val === 'number') as number[];
                                result[k] = values.length > 0 ? Math.min(...values) : null;
                            }
                            if (groupOp.$max && typeof groupOp.$max === 'string') {
                                const values = rows.map(row => row[groupOp.$max as string])
                                    .filter(val => typeof val === 'number') as number[];
                                result[k] = values.length > 0 ? Math.max(...values) : null;
                            }
                        }
                        return result;
                    });
                }

                if (stage.$sort) {
                    return acc.sort((a, b) => {
                        for (const key in stage.$sort!) {
                            const aVal = a[key];
                            const bVal = b[key];
                            
                            if (aVal == null && bVal == null) continue;
                            if (aVal == null) return stage.$sort![key] === 1 ? -1 : 1;
                            if (bVal == null) return stage.$sort![key] === 1 ? 1 : -1;
                            if (aVal < bVal) return stage.$sort![key] === 1 ? -1 : 1;
                            if (aVal > bVal) return stage.$sort![key] === 1 ? 1 : -1;
                        }
                        return 0;
                    });
                }

                if (stage.$skip) {
                    return acc.slice(stage.$skip);
                }

                if (stage.$limit) {
                    return acc.slice(0, stage.$limit);
                }

                return acc;
            }, data);
        } finally {
            connection.release();
        }
    }

    private async insertInternal(collection: string, record: DataRecord): Promise<void> {
        const data = await this.loadFile(collection);
        data.push(record);
        await this.saveFile(collection, data);
    }

    private async updateInternal(collection: string, filter: QueryFilter, changes: Partial<DataRecord>): Promise<void> {
        const data = await this.loadFile(collection);
        for (const row of data) {
            if (this.matchFilter(row, filter)) {
                Object.assign(row, changes);
            }
        }
        await this.saveFile(collection, data);
    }

    private async deleteInternal(collection: string, filter: QueryFilter): Promise<void> {
        const data = await this.loadFile(collection);
        const filtered = data.filter(row => !this.matchFilter(row, filter));
        await this.saveFile(collection, filtered);
    }

    public async insert(collection: string, record: DataRecord): Promise<void> {
        this.checkPermission('insert');
        
        const connection = await this.connectionPool.acquireConnection();
        try {
            await this.insertInternal(collection, record);
        } finally {
            connection.release();
        }
    }

    public async update(collection: string, filter: QueryFilter, changes: Partial<DataRecord>): Promise<void> {
        this.checkPermission('update');
        
        const connection = await this.connectionPool.acquireConnection();
        try {
            await this.updateInternal(collection, filter, changes);
        } finally {
            connection.release();
        }
    }

    public async delete(collection: string, filter: QueryFilter): Promise<void> {
        this.checkPermission('delete');
        
        const connection = await this.connectionPool.acquireConnection();
        try {
            await this.deleteInternal(collection, filter);
        } finally {
            connection.release();
        }
    }

    private hasIndex(collection: string, field: string): boolean {
        const indexKey = `${collection}.${field}`;
        return this.indexes.has(indexKey);
    }

    public async generateIndex(collection: string, field: string): Promise<void> {
        this.checkPermission('index');
        
        const connection = await this.connectionPool.acquireConnection();
        try {
            const data = await this.loadFile(collection);
            const index: IndexEntry = {};
            
            data.forEach((item, i) => {
                const key = String(item[field] ?? 'null');
                if (key in index) {
                    index[key].push(i);
                } else {
                    index[key] = [i];
                }
            });
            
            const indexKey = `${collection}.${field}`;
            this.indexes.set(indexKey, index);
            
            // Persist index to disk
            const indexPath = path.join(this.config.database, `${collection}.index.${field}.json`);
            await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2));
        } finally {
            connection.release();
        }
    }

    public async dropIndex(collection: string, field: string): Promise<void> {
        this.checkPermission('index');
        
        const indexKey = `${collection}.${field}`;
        this.indexes.delete(indexKey);
        
        const indexPath = path.join(this.config.database, `${collection}.index.${field}.json`);
        if (fs.existsSync(indexPath)) {
            await fs.promises.unlink(indexPath);
        }
    }

    public async createCollection(collection: string): Promise<void> {
        this.checkPermission('create_collection');
        
        const connection = await this.connectionPool.acquireConnection();
        try {
            const filePath = this.getCollectionPath(collection);
            if (fs.existsSync(filePath)) {
                throw new ValidationError(`Collection '${collection}' already exists`);
            }
            
            await this.saveFile(collection, []);
        } finally {
            connection.release();
        }
    }

    public async dropCollection(collection: string): Promise<void> {
        this.checkPermission('drop_collection');
        
        const connection = await this.connectionPool.acquireConnection();
        try {
            const filePath = this.getCollectionPath(collection);
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
            
            // Remove from cache
            this.cache.delete(collection);
            
            // Remove indexes
            const indexPattern = `${collection}.`;
            for (const indexKey of this.indexes.keys()) {
                if (indexKey.startsWith(indexPattern)) {
                    this.indexes.delete(indexKey);
                    
                    // Remove index file
                    const field = indexKey.substring(indexPattern.length);
                    const indexPath = path.join(this.config.database, `${collection}.index.${field}.json`);
                    if (fs.existsSync(indexPath)) {
                        await fs.promises.unlink(indexPath);
                    }
                }
            }
            
            // Remove query patterns
            delete this.queryPatterns[collection];
        } finally {
            connection.release();
        }
    }

    public listCollections(): string[] {
        try {
            const files = fs.readdirSync(this.config.database);
            return files
                .filter(file => file.endsWith('.tdbx'))
                .map(file => file.replace('.tdbx', ''));
        } catch (error) {
            throw new TextDBXError(
                `Failed to list collections: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'DIRECTORY_READ_ERROR'
            );
        }
    }

    public async getCollectionStats(collection: string): Promise<{
        documentCount: number;
        averageDocumentSize: number;
        totalSize: number;
        indexes: string[];
        lastModified: Date;
    }> {
        this.checkPermission('query');
        
        const connection = await this.connectionPool.acquireConnection();
        try {
            const data = await this.loadFile(collection);
            const filePath = this.getCollectionPath(collection);
            const stats = fs.statSync(filePath);
            
            const totalSize = stats.size;
            const documentCount = data.length;
            const averageDocumentSize = documentCount > 0 ? totalSize / documentCount : 0;
            
            const indexes = Array.from(this.indexes.keys())
                .filter(key => key.startsWith(`${collection}.`))
                .map(key => key.substring(collection.length + 1));
            
            return {
                documentCount,
                averageDocumentSize,
                totalSize,
                indexes,
                lastModified: stats.mtime
            };
        } finally {
            connection.release();
        }
    }

    public getConnectionStats(): { active: number; waiting: number; max: number } {
        return this.connectionPool.getStats();
    }

    public getCacheStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
        collections: Array<{ name: string; accessCount: number; lastAccessed: Date }>;
    } {
        const collections = Array.from(this.cache.entries()).map(([name, entry]) => ({
            name,
            accessCount: entry.accessCount,
            lastAccessed: new Date(entry.lastAccessed)
        }));
        
        // Calculate hit rate (simplified - would need request tracking for accurate rate)
        const totalAccesses = collections.reduce((sum, col) => sum + col.accessCount, 0);
        const hitRate = totalAccesses > 0 ? (totalAccesses / (totalAccesses + this.cache.size)) : 0;
        
        return {
            size: this.cache.size,
            maxSize: this.config.maxCacheSize || 100,
            hitRate,
            collections
        };
    }

    public async clearCache(): Promise<void> {
        this.cache.clear();
    }

    public async backup(backupPath: string): Promise<void> {
        this.checkPermission('backup');
        
        try {
            if (!fs.existsSync(backupPath)) {
                fs.mkdirSync(backupPath, { recursive: true });
            }
            
            const collections = this.listCollections();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(backupPath, `backup-${timestamp}`);
            fs.mkdirSync(backupDir);
            
            // Copy all collection files
            for (const collection of collections) {
                const sourcePath = this.getCollectionPath(collection);
                const destPath = path.join(backupDir, `${collection}.tdbx`);
                await fs.promises.copyFile(sourcePath, destPath);
            }
            
            // Copy metadata files
            const metadataFiles = ['.users', '.auth'];
            for (const file of metadataFiles) {
                const sourcePath = path.join(this.config.database, file);
                if (fs.existsSync(sourcePath)) {
                    const destPath = path.join(backupDir, file);
                    await fs.promises.copyFile(sourcePath, destPath);
                }
            }
            
            // Create backup manifest
            const manifest = {
                timestamp: new Date().toISOString(),
                collections,
                version: '1.0',
                mode: this.config.mode
            };
            
            await fs.promises.writeFile(
                path.join(backupDir, 'manifest.json'),
                JSON.stringify(manifest, null, 2)
            );
        } catch (error) {
            throw new TextDBXError(
                `Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'BACKUP_ERROR'
            );
        }
    }

    public async restore(backupPath: string): Promise<void> {
        this.checkPermission('restore');
        
        try {
            // Validate backup
            const manifestPath = path.join(backupPath, 'manifest.json');
            if (!fs.existsSync(manifestPath)) {
                throw new ValidationError('Invalid backup: manifest.json not found');
            }
            
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (manifest.mode !== this.config.mode) {
                throw new ValidationError(
                    `Backup mode (${manifest.mode}) doesn't match current mode (${this.config.mode})`
                );
            }
            
            // Clear current cache
            this.cache.clear();
            this.indexes.clear();
            
            // Restore collections
            for (const collection of manifest.collections) {
                const sourcePath = path.join(backupPath, `${collection}.tdbx`);
                const destPath = this.getCollectionPath(collection);
                
                if (fs.existsSync(sourcePath)) {
                    await fs.promises.copyFile(sourcePath, destPath);
                }
            }
            
            // Restore metadata
            const metadataFiles = ['.users', '.auth'];
            for (const file of metadataFiles) {
                const sourcePath = path.join(backupPath, file);
                if (fs.existsSync(sourcePath)) {
                    const destPath = path.join(this.config.database, file);
                    await fs.promises.copyFile(sourcePath, destPath);
                }
            }
            
            // Reload user data
            this.loadUsersAndAuth();
        } catch (error) {
            throw new TextDBXError(
                `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'RESTORE_ERROR'
            );
        }
    }

    public async close(): Promise<void> {
        // Wait for all active transactions to complete
        const pendingTransactions = Array.from(this.activeTransactions.values())
            .filter(tx => tx.status === 'pending');
        
        for (const tx of pendingTransactions) {
            await this.rollbackTransaction(tx.id);
        }
        
        // Clear cache and close connections
        this.cache.clear();
        this.indexes.clear();
        
        // Note: In a real implementation, you'd wait for the connection pool to drain
        // For now, we'll just emit a close event
        this.connectionPool.emit('close');
    }

    // Utility methods for validation and data integrity
    public async validateCollection(collection: string): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        try {
            const data = await this.loadFile(collection);
            
            // Check for duplicate IDs if _id field exists
            const ids = new Set<string>();
            for (let i = 0; i < data.length; i++) {
                const record = data[i];
                if (record._id) {
                    const id = String(record._id);
                    if (ids.has(id)) {
                        errors.push(`Duplicate _id found: ${id} at index ${i}`);
                    }
                    ids.add(id);
                }
            }
            
            // Check for data type consistency
            if (data.length > 0) {
                const firstRecord = data[0];
                const fieldTypes = new Map<string, string>();
                
                for (const [key, value] of Object.entries(firstRecord)) {
                    fieldTypes.set(key, typeof value);
                }
                
                for (let i = 1; i < data.length; i++) {
                    const record = data[i];
                    for (const [key, expectedType] of fieldTypes) {
                        if (record[key] !== undefined && typeof record[key] !== expectedType) {
                            warnings.push(
                                `Type inconsistency in field '${key}' at index ${i}: expected ${expectedType}, got ${typeof record[key]}`
                            );
                        }
                    }
                }
            }
            
        } catch (error) {
            errors.push(`Failed to validate collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // Performance monitoring
    public getPerformanceMetrics(): {
        cacheStats: {
            size: number;
            maxSize: number;
            hitRate: number;
            collections: Array<{ name: string; accessCount: number; lastAccessed: Date }>;
        };
        connectionStats: ReturnType<TextDBX['getConnectionStats']>;
        queryPatterns: { [collection: string]: { [field: string]: number } };
        activeTransactions: number;
        indexCount: number;
    } {
        return {
            cacheStats: this.getCacheStats(),
            connectionStats: this.getConnectionStats(),
            queryPatterns: { ...this.queryPatterns },
            activeTransactions: this.activeTransactions.size,
            indexCount: this.indexes.size
        };
    }
}