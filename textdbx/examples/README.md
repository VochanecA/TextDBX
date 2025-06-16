# TextDBX Database Test Suite

![TextDBX Logo](https://via.placeholder.com/150x50?text=TextDBX) 
*A comprehensive test suite for TextDBX database operations*

## 📋 Overview

This test suite verifies all core functionality of the TextDBX database system, including:

- CRUD operations
- Complex queries
- Indexing
- Transactions
- Aggregation
- Backup/restore
- Performance metrics

## 🚀 Quick Start

### Prerequisites
- Node.js (v16+ recommended)
- TypeScript (`npm install -g typescript`)
- ts-node (`npm install -g ts-node`)

### Installation
1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create your config.connect file:
```bash
database=./test_db
encryptionKey=your-32-character-encryption-key-here
mode=encrypted  # or 'plain' for development
role=admin
permissions=query,insert,update,delete,create_collection,drop_collection,index,backup,restore
```
4. Running Tests:
```bash
npx ts-node example.ts
```

5. Test Structure:

```bash
async function testAllFeatures() {
  // 1. Collection Operations
  await testCollectionOperations(db);
  
  // 2. CRUD Operations
  await testCRUDOperations(db, 'test_data');
  
  // 3. Query Features
  await testQueryFeatures(db, 'test_data');
  
  // 4. Indexing
  await testIndexing(db, 'test_data');
  
  // 5. Transactions
  await testTransactions(db, 'test_data');
  
  // 6. Aggregation
  await testAggregation(db, 'test_data');
  
  // 7. Backup/Restore
  await testBackupRestore(db);
  
  // 8. Performance Metrics
  await testPerformanceMetrics(db, 'test_data');
}
```

6. Understanding Test Output
Success Indicators

    ✓ - Test passed

    ℹ - Information (feature available but not fully tested)

    ⚠ - Warning (partial test completion)

7. Sample Output

```bash
Starting TextDBX Comprehensive Test...
✓ Database initialized

=== 1. Collection Operations ===
✓ Created collection "test_temp"
✓ Dropped collection "test_temp"

=== 2. CRUD Operations ===
✓ Inserted test record
✓ Retrieved inserted record
✓ Updated record
✓ Deleted record

=== 3. Query Operations ===
✓ Basic query: [...]
✓ Complex query: [...]
```
8. Troubleshooting
 Common Issues

    Permission Errors

        Verify .auth file exists in database directory

        Check role permissions in config

    Encryption Errors

        Ensure consistent encryptionKey

        Verify mode matches existing data

    Collection Issues

        Don't manually create .tdbx files

        Let TextDBX handle file creation

9. Debugging Tips

```bash

// Enable debug logging in your tests
console.log('Debug:', {
  collections: db.listCollections(),
  metrics: db.getPerformanceMetrics()
});
```

10. 📊 Performance Testing

The test suite includes performance metrics tracking:
```bash
const metrics = db.getPerformanceMetrics();
console.log({
  cacheHitRate: metrics.cacheStats.hitRate,
  activeConnections: metrics.connectionStats.active,
  queryPatterns: metrics.queryPatterns
});
```

📜 License

MIT License - Free for commercial and personal use
🙋 Support

For issues or questions, please open an issue