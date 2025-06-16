# TextDBX 🗄️

A powerful, lightweight, AES-encrypted, JSON-based database system with enterprise-grade features including transactions, aggregations, indexing, and role-based access control - all without external dependencies.

## 🎯 Why TextDBX?

- **Zero Dependencies**: Unlike heavy databases - no external dependencies, complex installations, or daemon processes
- **Encrypted by Default**: Privacy-first approach with AES-256-CBC encryption and PBKDF2 key derivation
- **File-based Architecture**: Easy backup, version control, and deployment - just copy files
- **Enterprise Security**: Role-based access control with granular permissions from day one
- **JSON Native**: Perfect for modern web apps - no ORM complexity or schema migrations
- **Serverless Friendly**: No daemon processes needed - works anywhere Node.js runs
- **Production Ready**: Connection pooling, caching, transactions, and comprehensive error handling

## ✨ Core Features

### 🔐 **Advanced Security**
- **AES-256-CBC Encryption**: Military-grade encryption with configurable plain/encrypted modes
- **PBKDF2 Key Derivation**: 100,000 iterations with random salts for maximum security
- **Role-based Access Control**: Granular permissions (query, insert, update, delete, backup, etc.)
- **Secure File Locking**: Prevents data corruption during concurrent operations
- **User Management**: Built-in user authentication with hashed passwords

### ⚡ **Performance & Scalability**
- **Connection Pooling**: Configurable concurrent connection management (default: 10)
- **Intelligent Caching**: LRU cache with configurable size and automatic eviction
- **Auto-Indexing**: Automatically generates indexes for frequently queried fields
- **Query Optimization**: Pattern analysis for performance improvements
- **Atomic Operations**: File-level locking with temporary file writes and atomic renames

### 🔍 **Powerful Query Engine**
- **MongoDB-style Queries**: Familiar syntax with logical operators (`$and`, `$or`, `$not`)
- **Comparison Operators**: `$gt`, `$lt`, `$gte`, `$lte`, `$contains`, `$in`, `$exists`
- **Field Projection**: Select only the fields you need
- **Sorting & Pagination**: `sort`, `limit`, `skip` operations
- **Array Support**: Query arrays with `$contains` and handle nested data structures

### 📊 **Advanced Aggregations**
- **Pipeline Processing**: Multi-stage aggregation pipelines
- **Grouping Operations**: `$group` with `_id` specification
- **Mathematical Functions**: `$sum`, `$avg`, `$count`, `$min`, `$max`
- **Filtering & Sorting**: `$match`, `$sort` within pipelines
- **Pagination**: `$limit` and `$skip` in aggregation stages

### 🔄 **ACID Transactions**
- **Full Transaction Support**: `beginTransaction()`, `commitTransaction()`, `rollbackTransaction()`
- **Automatic Rollback**: Failures automatically restore previous state
- **Operation Batching**: Group multiple operations into atomic units
- **Backup & Restore**: Automatic backups before transaction operations
- **Transaction Tracking**: Monitor active transactions with unique IDs

### 🗂️ **Collection Management**
- **Dynamic Collections**: Create and drop collections on-demand
- **Collection Statistics**: Document count, size, indexes, last modified
- **Validation Tools**: Data integrity checking with error and warning reports
- **Backup System**: Full database backup with manifests and metadata
- **Restore Functionality**: Complete database restoration with validation

### 📈 **Monitoring & Analytics**
- **Performance Metrics**: Cache hit rates, connection stats, query patterns
- **Health Monitoring**: Collection validation, data integrity checks
- **Query Analytics**: Track frequently accessed fields for optimization
- **Resource Usage**: Monitor active connections, cache utilization, transaction load
- **Index Management**: Track index usage and performance impact

## 🚀 **Technical Architecture**

### **Data Storage**
- **File Format**: JSON with optional AES-256-CBC encryption
- **Atomic Writes**: Temporary files + atomic rename for data integrity
- **Collection Isolation**: Each collection stored in separate `.tdbx` files
- **Metadata Management**: Separate files for users (`.users`) and permissions (`.auth`)

### **Security Model**
- **Encryption**: Salt + IV + encrypted data format for maximum security
- **Key Management**: PBKDF2 with configurable iterations and random salts
- **Access Control**: Role-based permissions with action-level granularity
- **User Authentication**: Secure password hashing with individual salt per user

### **Error Handling**
- **Custom Error Types**: `TextDBXError`, `ValidationError`, `PermissionError`, `TransactionError`
- **Comprehensive Validation**: Collection names, data types, configuration validation
- **Graceful Degradation**: Auto-recovery from common errors and data corruption
- **Detailed Error Context**: Error codes and contextual information for debugging

### **Configuration System**
```
database=/path/to/database
encryptionKey=your-32-character-encryption-key
mode=encrypted
role=admin
maxCacheSize=100
maxConnections=10
queryTimeout=30000
```

## 📊 **Query Examples**

### **Basic Queries**
```typescript
// Simple filtering
await db.queryObject({
  collection: 'users',
  filter: { status: 'active', age: { $gte: 18 } }
});

// With projection and sorting
await db.queryObject({
  collection: 'products',
  filter: { category: { $in: ['electronics', 'gadgets'] } },
  fields: ['name', 'price', 'rating'],
  sort: { price: -1 },
  limit: 10
});
```

### **Advanced Aggregations**
```typescript
// Sales analytics
await db.aggregate('orders', [
  { $match: { status: 'completed' } },
  { $group: { 
    _id: { region: 'region' },
    totalSales: { $sum: 'amount' },
    avgOrder: { $avg: 'amount' },
    orderCount: { $count: true }
  }},
  { $sort: { totalSales: -1 } }
]);
```

### **Transaction Operations**
```typescript
const txId = await db.beginTransaction();
try {
  await db.insert('users', { name: 'John', email: 'john@example.com' });
  await db.update('counters', { type: 'user' }, { $inc: { count: 1 } });
  await db.commitTransaction(txId);
} catch (error) {
  await db.rollbackTransaction(txId);
}
```

## 🛠️ **Management Operations**

### **Collection Management**
```typescript
// Create and manage collections
await db.createCollection('newCollection');
await db.dropCollection('oldCollection');
const collections = db.listCollections();

// Get detailed statistics
const stats = await db.getCollectionStats('users');
console.log(stats.documentCount, stats.totalSize, stats.indexes);
```

### **Performance Monitoring**
```typescript
// Monitor system performance
const metrics = db.getPerformanceMetrics();
console.log('Cache hit rate:', metrics.cacheStats.hitRate);
console.log('Active connections:', metrics.connectionStats.active);
console.log('Query patterns:', metrics.queryPatterns);
```

### **Backup & Restore**
```typescript
// Full database backup
await db.backup('/path/to/backup/directory');

// Restore from backup
await db.restore('/path/to/backup/backup-2024-01-15T10-30-00-000Z');
```

## 🔧 **Configuration & Setup**

### **Installation**
```bash
npm install textdbx
```

### **Basic Setup**
```typescript
import { TextDBX } from 'textdbx';

// Initialize with config file
const db = new TextDBX('./config.txt');

// Start using immediately
const users = await db.queryObject({
  collection: 'users',
  filter: { active: true }
});
```

### **Configuration File**
```
# Database configuration
database=./data
encryptionKey=my-super-secret-32-character-key
mode=encrypted
role=admin

# Performance tuning
maxCacheSize=200
maxConnections=15
queryTimeout=60000
```

## 🎯 **Use Cases**

### **Perfect For:**
- **Serverless Applications**: No daemon processes or external dependencies
- **Small to Medium Applications**: Up to millions of records per collection
- **Privacy-Focused Apps**: Built-in encryption and security
- **Rapid Prototyping**: No schema setup or complex configuration
- **Embedded Systems**: Lightweight with minimal resource requirements
- **Edge Computing**: Works offline with file-based storage

### **Enterprise Features:**
- **Multi-user Applications**: Role-based access control
- **Financial Systems**: ACID transactions for data consistency
- **Analytics Platforms**: Advanced aggregation capabilities
- **Audit Systems**: Transaction logging and backup functionality
- **Content Management**: JSON-native with flexible schema

## 📈 **Performance Characteristics**

- **Throughput**: Thousands of operations per second (depending on hardware)
- **Scalability**: Horizontal scaling through collection partitioning
- **Memory Usage**: Configurable caching with LRU eviction
- **Disk Usage**: Compact JSON storage with optional compression
- **Startup Time**: Instant startup - no initialization delays
- **Query Performance**: Sub-millisecond queries with proper indexing

## 🛡️ **Production Considerations**

- **Data Integrity**: Atomic operations with automatic rollback
- **Concurrent Access**: Connection pooling with configurable limits
- **Error Recovery**: Comprehensive error handling and validation
- **Monitoring**: Built-in metrics and performance tracking
- **Backup Strategy**: Automated backup with manifest validation
- **Security**: Encryption at rest with role-based access control

---

**TextDBX** - Where simplicity meets enterprise-grade functionality. Zero complexity, maximum power. 🚀