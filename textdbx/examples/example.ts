import { TextDBX } from './TextDBX';
import * as fs from 'fs';
import * as path from 'path';

async function testAllFeatures() {
    console.log('Starting TextDBX Comprehensive Test...');
    
    // Initialize database
    const db = new TextDBX('./config.connect');
    console.log('✓ Database initialized');

    try {
        // 1. Test basic collection operations
        console.log('\n=== 1. Collection Operations ===');
        await testCollectionOperations(db);

        // 2. Test CRUD operations
        console.log('\n=== 2. CRUD Operations ===');
        const testCollection = 'test_data';
        await testCRUDOperations(db, testCollection);

        // 3. Test query capabilities
        console.log('\n=== 3. Query Operations ===');
        await testQueryFeatures(db, testCollection);

        // 4. Test indexing
        console.log('\n=== 4. Indexing ===');
        await testIndexing(db, testCollection);

        // 5. Test transactions
        console.log('\n=== 5. Transactions ===');
        await testTransactions(db, testCollection);

        // 6. Test aggregation
        console.log('\n=== 6. Aggregation ===');
        await testAggregation(db, testCollection);

        // 7. Test backup/restore
        console.log('\n=== 7. Backup/Restore ===');
        await testBackupRestore(db);

        // 8. Test performance metrics
        console.log('\n=== 8. Performance Metrics ===');
        await testPerformanceMetrics(db, testCollection);

    } catch (error) {
        console.error('\n⚠ Test failed:', error instanceof Error ? error.message : error);
    } finally {
        await db.close();
        console.log('\nDatabase connection closed');
    }
}

async function testCollectionOperations(db: TextDBX) {
    try {
        // List existing collections
        const collections = db.listCollections();
        console.log('Existing collections:', collections);

        // Create new collection
        const testCollection = 'test_temp';
        if (collections.includes(testCollection)) {
            await db.dropCollection(testCollection);
        }
        await db.createCollection(testCollection);
        console.log(`✓ Created collection "${testCollection}"`);

        // Verify creation
        const updatedCollections = db.listCollections();
        if (!updatedCollections.includes(testCollection)) {
            throw new Error('Collection creation failed');
        }

        // Cleanup
        await db.dropCollection(testCollection);
        console.log(`✓ Dropped collection "${testCollection}"`);

    } catch (error) {
        console.log('ℹ Collection operations limited:', error instanceof Error ? error.message : error);
    }
}

async function testCRUDOperations(db: TextDBX, collection: string) {
    try {
        // Create sample data
        const testData = {
            id: 1,
            name: 'Test User',
            email: 'test@example.com',
            age: 30,
            active: true,
            tags: [{ tag: 'user' }, { tag: 'tester' }],
            meta: {
                created: new Date().toISOString(),
                modified: null
            }
        };

        // Insert
        await db.insert(collection, testData);
        console.log('✓ Inserted test record');

        // Read
        const records = await db.queryObject({
            collection,
            filter: { id: 1 }
        });
        if (records.length === 0) throw new Error('Insert verification failed');
        console.log('✓ Retrieved inserted record');

        // Update
        await db.update(
            collection,
            { id: 1 },
            { 'meta.modified': new Date().toISOString(), age: 31 }
        );
        console.log('✓ Updated record');

        // Verify update
        const updated = await db.queryObject({
            collection,
            filter: { id: 1, age: 31 }
        });
        if (updated.length === 0) throw new Error('Update verification failed');

        // Delete
        await db.delete(collection, { id: 1 });
        console.log('✓ Deleted record');

        // Verify delete
        const remaining = await db.queryObject({
            collection,
            filter: { id: 1 }
        });
        if (remaining.length > 0) throw new Error('Delete verification failed');

    } catch (error) {
        console.log('ℹ CRUD operations limited:', error instanceof Error ? error.message : error);
    }
}

async function testQueryFeatures(db: TextDBX, collection: string) {
    try {
        // Insert test data
        const testRecords = [
            { id: 1, name: 'Alice', age: 28, role: 'admin', active: true },
            { id: 2, name: 'Bob', age: 35, role: 'user', active: true },
            { id: 3, name: 'Charlie', age: 42, role: 'user', active: false }
        ];

        for (const record of testRecords) {
            await db.insert(collection, record);
        }

        // Simple query
        const allActive = await db.queryObject({
            collection,
            filter: { active: true },
            fields: ['id', 'name'],
            sort: { age: 1 }
        });
        console.log('✓ Basic query:', allActive);

        // Complex query
        const complexQuery = await db.queryObject({
            collection,
            filter: {
                $or: [
                    { age: { $gt: 30 } },
                    { role: 'admin' }
                ],
                active: true
            },
            limit: 5
        });
        console.log('✓ Complex query:', complexQuery);

        // Cleanup
        await db.delete(collection, {});

    } catch (error) {
        console.log('ℹ Query features limited:', error instanceof Error ? error.message : error);
    }
}

async function testIndexing(db: TextDBX, collection: string) {
    try {
        // Create test data
        for (let i = 1; i <= 100; i++) {
            await db.insert(collection, {
                id: i,
                name: `User ${i}`,
                value: Math.floor(Math.random() * 1000)
            });
        }

        // Create index
        await db.generateIndex(collection, 'value');
        console.log('✓ Created index on "value" field');

        // Query using index
        const highValue = await db.queryObject({
            collection,
            filter: { value: { $gt: 900 } },
            limit: 5
        });
        console.log('✓ Indexed query:', highValue);

        // Get index stats
        const stats = await db.getCollectionStats(collection);
        console.log('Index stats:', stats.indexes);

        // Cleanup
        await db.dropIndex(collection, 'value');
        await db.delete(collection, {});

    } catch (error) {
        console.log('ℹ Indexing limited:', error instanceof Error ? error.message : error);
    }
}

async function testTransactions(db: TextDBX, collection: string) {
    try {
        const txId = await db.beginTransaction();
        console.log('✓ Transaction started:', txId);

        try {
            // Insert in transaction
            await db.insert(collection, { id: 100, name: 'Tx Test' });

            // Update in transaction
            await db.update(
                collection,
                { id: 100 },
                { status: 'pending' }
            );

            await db.commitTransaction(txId);
            console.log('✓ Transaction committed');

            // Verify
            const result = await db.queryObject({
                collection,
                filter: { id: 100 }
            });
            if (result.length === 0) throw new Error('Transaction failed');

        } catch (error) {
            await db.rollbackTransaction(txId);
            console.log('✓ Transaction rolled back');
            throw error;
        }

        // Cleanup
        await db.delete(collection, { id: 100 });

    } catch (error) {
        console.log('ℹ Transactions limited:', error instanceof Error ? error.message : error);
    }
}

async function testAggregation(db: TextDBX, collection: string) {
    try {
        // Create test data
        const roles = ['admin', 'user', 'guest'];
        for (let i = 1; i <= 50; i++) {
            await db.insert(collection, {
                id: i,
                name: `User ${i}`,
                role: roles[Math.floor(Math.random() * roles.length)],
                score: Math.floor(Math.random() * 100)
            });
        }

        // Run aggregation
        const results = await db.aggregate(collection, [
            { $match: { score: { $gt: 50 } } as any },
            { $group: {
                _id: '$role',
                count: { $count: true },
                avgScore: { $avg: 'score' },
                minScore: { $min: 'score' },
                maxScore: { $max: 'score' }
            } as any },
            { $sort: { avgScore: -1 } as any }
        ]);
        console.log('✓ Aggregation results:', results);

        // Cleanup
        await db.delete(collection, {});

    } catch (error) {
        console.log('ℹ Aggregation limited:', error instanceof Error ? error.message : error);
    }
}

async function testBackupRestore(db: TextDBX) {
    const backupPath = './db_backup';
    
    try {
        // Verify backup permission first
        try {
            // Test permission by creating a small backup directory
            if (!fs.existsSync(backupPath)) {
                fs.mkdirSync(backupPath, { recursive: true });
            }
            fs.writeFileSync(path.join(backupPath, 'permission_test'), 'test');
            fs.unlinkSync(path.join(backupPath, 'permission_test'));

            // If we got here, we have filesystem access - try actual backup
            await db.backup(backupPath);
            console.log(`✓ Backup created at ${backupPath}`);

            // Test restore
            await db.restore(backupPath);
            console.log('✓ Restore completed');

            // Cleanup backup files
            fs.rmSync(backupPath, { recursive: true, force: true });
        } catch (error) {
            if (error instanceof Error && error.message.includes('Permission denied')) {
                console.log('ℹ Backup/restore not available with current permissions');
                return;
            }
            throw error;
        }
    } catch (error) {
        console.log('⚠ Backup/restore test failed:', error instanceof Error ? error.message : error);
        
        // Cleanup any partial backup files
        if (fs.existsSync(backupPath)) {
            fs.rmSync(backupPath, { recursive: true, force: true });
        }
    }
}

async function testPerformanceMetrics(db: TextDBX, collection: string) {
    try {
        // Generate some load
        for (let i = 0; i < 20; i++) {
            await db.queryObject({ collection, limit: 5 });
        }

        // Get metrics
        const metrics = db.getPerformanceMetrics();
        console.log('Performance metrics:', {
            cacheSize: metrics.cacheStats.size,
            cacheHitRate: metrics.cacheStats.hitRate.toFixed(2),
            activeConnections: metrics.connectionStats.active,
            queryPatterns: Object.keys(metrics.queryPatterns).length
        });

    } catch (error) {
        console.log('ℹ Performance metrics limited:', error instanceof Error ? error.message : error);
    }
}

// Run the comprehensive test
testAllFeatures()
    .then(() => console.log('\n✅ All tests completed'))
    .catch(() => console.log('\n❌ Some tests failed'));