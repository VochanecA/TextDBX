# TextDBX 🗄️

A lightweight, AES-encrypted, JSON-based database with enhanced error handling and role-based access control.

## 🎯 Why TextDBX?

- **Zero Dependencies**: Unlike heavy databases - no external dependencies or complex installations
- **Encrypted by Default**: Privacy-first approach with AES-256-CBC encryption built-in
- **File-based**: Easy backup, version control, and deployment - just copy files
- **Role-based Security**: Enterprise-ready from day one with granular permissions
- **JSON Native**: Perfect for modern web apps - no ORM complexity
- **Serverless Friendly**: No daemon processes needed - works anywhere Node.js runs

## ✨ Features

- **🔐 Security**: AES-256-CBC encryption with configurable modes
- **👥 Access Control**: Role-based permissions system
- **📁 Simple Storage**: JSON-based file storage
- **🔍 Flexible Queries**: Filter and project data with ease
- **⚡ Performance**: Built-in indexing support
- **🛡️ Reliability**: Comprehensive error handling and auto-recovery
- **🔧 Easy Setup**: Simple configuration file
- **📊 Monitoring**: Health check functionality

## 🚀 Quick Start

### Installation

```bash
npm install textdbx
# or
yarn add textdbx
```

### Basic Setup

1. **Create a configuration file** (`config.connect`):
```
database=./database
encryptionKey=your-secure-key-here-must-be-32-chars-minimum
mode=encrypted
role=admin
```

2. **Initialize the database**:
```typescript
import { TextDBX } from 'textdbx';

const db = new TextDBX('./config.connect');
```

## 📖 Usage Guide

### Configuration

Create a `config.connect` file with these required fields:

```
# Database directory path
database=./database

# Encryption key (32+ characters recommended)
encryptionKey=your-secure-encryption-key-here

# Mode: 'encrypted' or 'plain'
mode=encrypted

# User role: 'admin', 'editor', or 'reader'
role=admin
```

### Generate Secure Encryption Key

```typescript
import { TextDBX } from 'textdbx';

// Generate a secure 32-byte encryption key
const secureKey = TextDBX.generateEncryptionKey();
console.log('Your secure key:', secureKey);
```

### Basic Operations

#### Insert Data
```typescript
// Insert a single record
db.insert('users', {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  tags: ['developer', 'typescript']
});

// Insert multiple records
db.insert('users', { id: 2, name: 'Jane Smith', email: 'jane@example.com' });
db.insert('users', { id: 3, name: 'Bob Wilson', email: 'bob@example.com' });
```

#### Query Data
```typescript
// Get all records
const allUsers = db.queryObject({ collection: 'users' });

// Filter by exact match
const johnDoe = db.queryObject({
  collection: 'users',
  filter: { name: 'John Doe' }
});

// Filter by array contains
const developers = db.queryObject({
  collection: 'users',
  filter: { tags: { $contains: 'developer' } }
});

// Project specific fields only
const userEmails = db.queryObject({
  collection: 'users',
  fields: ['name', 'email']
});
```

#### Update Data
```typescript
// Update records matching filter
const updatedCount = db.update(
  'users',
  { name: 'John Doe' },
  { email: 'john.doe@newdomain.com', lastModified: new Date() }
);

console.log(`Updated ${updatedCount} records`);
```

#### Delete Data
```typescript
// Delete records matching filter
const deletedCount = db.delete('users', { id: 3 });
console.log(`Deleted ${deletedCount} records`);
```

### Advanced Features

#### Indexing
```typescript
// Create an index on a field for faster queries
db.generateIndex('users', 'email');
db.generateIndex('users', 'id');
```

#### Health Check
```typescript
const health = db.healthCheck();
console.log('Database status:', health.status);
if (health.issues.length > 0) {
  console.log('Issues found:', health.issues);
}
```

## 🔒 Security & Permissions

### Role-Based Access Control

TextDBX supports three default roles with different permissions:

| Role | Permissions |
|------|-------------|
| `admin` | query, insert, update, delete, index |
| `editor` | query, insert, update |
| `reader` | query |

### Custom Permissions

You can customize permissions by editing the `.auth` file in your database directory:

```json
{
  "admin": ["query", "insert", "update", "delete", "index"],
  "editor": ["query", "insert", "update"],
  "reader": ["query"],
  "custom_role": ["query", "insert"]
}
```

### Encryption Modes

- **Encrypted Mode** (`mode=encrypted`): All data files are encrypted using AES-256-CBC
- **Plain Mode** (`mode=plain`): Data stored in plain text (not recommended for production)

## 📂 File Structure

```
database/
├── .auth                    # Permission configuration
├── .users                   # User management (optional)
├── collection1.tdbx         # Encrypted/plain data file
├── collection2.tdbx         # Another collection
├── collection1.index.field.json  # Index files
└── *.backup                 # Automatic backups
```

## 🛠️ Error Handling

TextDBX provides comprehensive error handling:

- **Automatic Recovery**: Corrupted files are backed up and reinitialized
- **Detailed Warnings**: Clear messages for configuration issues
- **Permission Errors**: Explicit permission denied messages
- **Validation**: Input validation for all operations

## 📊 Query Language

### Filter Operators

```typescript
// Exact match
{ name: 'John Doe' }

// Array contains
{ tags: { $contains: 'developer' } }

// Multiple conditions (AND)
{ name: 'John Doe', active: true }
```

### Field Projection

```typescript
// Select specific fields
db.queryObject({
  collection: 'users',
  fields: ['name', 'email']  // Only return these fields
});
```

## ⚠️ Important Notes

1. **Encryption Key**: Use a secure key of 32+ characters. Generate one with `TextDBX.generateEncryptionKey()`
2. **Backups**: TextDBX automatically creates backups before destructive operations
3. **Collection Names**: Use only letters, numbers, underscores, and hyphens
4. **File Safety**: Don't manually edit `.tdbx` files while the database is in use

## 🔧 Troubleshooting

### Common Issues

**"Cannot decrypt file"**
- Check if encryption key matches the one used to create the file
- Verify the mode setting matches how the file was created

**"Permission denied"**
- Check your role in `config.connect`
- Verify the `.auth` file has correct permissions for your role

**"Collection name invalid"**
- Use only alphanumeric characters, underscores, and hyphens
- Don't start collection names with a dot

## 📄 License

MIT License - feel free to use in your projects!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

---

**TextDBX** - Simple, secure, and reliable JSON database for Node.js applications.