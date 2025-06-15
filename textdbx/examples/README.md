# TextDBX Project Setup Guide

## 1. Initial Project Structure

Create your project directory structure:

```
my-textdbx-project/
├── config.connect          # Database configuration
├── src/
│   └── app.ts              # Your application code
└── database/               # Database directory (will contain .tdbx files)
    ├── .auth              # Permission definitions
    └── .users             # User definitions (optional)
```

## 2. Configuration Files

### config.connect
```
database=./database
encryptionKey=your-secret-key-here-make-it-long-and-secure
mode=encrypted
role=admin
```

**Mode Options:**
- `encrypted`: Data is encrypted (recommended for production)
- `plain`: Data stored as readable JSON (good for development/debugging)

### database/.auth
```json
{
  "admin": ["query", "insert", "update", "delete", "index"],
  "editor": ["query", "insert", "update"],
  "reader": ["query"]
}
```

### database/.users (optional)
```json
{
  "admin_user": {
    "role": "admin",
    "created": "2024-01-01"
  },
  "guest_user": {
    "role": "reader",
    "created": "2024-01-01"
  }
}
```

## 3. Quick Start Commands

### Setup Script (setup.sh)
```bash
#!/bin/bash
echo "Setting up TextDBX project..."

# Create directories
mkdir -p database

# Create config file
cat > config.connect << 'EOF'
database=./database
encryptionKey=c3VwZXJzZWNyZXRrZXkxMjM0NTY3ODkwYWJjZGVmZ2hpams
mode=encrypted
role=admin
EOF

# Create auth file
cat > database/.auth << 'EOF'
{
  "admin": ["query", "insert", "update", "delete", "index"],
  "editor": ["query", "insert", "update"],
  "reader": ["query"]
}
EOF

# Create users file
cat > database/.users << 'EOF'
{
  "admin_user": {
    "role": "admin",
    "created": "2024-01-01"
  }
}
EOF

echo "✅ TextDBX project setup complete!"
echo "📁 Database directory: ./database"
echo "🔐 Default role: admin"
echo "📝 Ready to create your first collection!"
```

## 4. First Usage Example

```typescript
import { TextDBX } from './TextDBX';

// Initialize database
const db = new TextDBX('./config.connect');

// Insert your first record (this creates the collection automatically)
const user = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  created: new Date().toISOString()
};

// This will automatically create 'users.tdbx'
db.insert('users', user);

// Query the collection
const results = db.queryObject({
  collection: 'users',
  filter: { name: 'John Doe' }
});

console.log('Users:', results);
```

## 5. Important Notes

### ✅ DO:
- Let TextDBX create .tdbx files automatically
- Use meaningful collection names (users, products, orders)
- Set appropriate permissions in .auth file
- Use encrypted mode for production
- Generate indexes for frequently queried fields

### ❌ DON'T:
- Manually create .tdbx files (leads to JSON parsing errors)
- Store sensitive data in plain mode in production
- Use simple encryption keys
- Skip the .auth file (causes permission errors)

## 6. Collection Naming Best Practices

Use descriptive, plural collection names:
- `users.tdbx` - for user data
- `products.tdbx` - for product catalog
- `orders.tdbx` - for order records
- `sessions.tdbx` - for user sessions

## 7. Development vs Production

### Development Setup:
```
mode=plain
role=admin
```

### Production Setup:
```
mode=encrypted
role=editor  # Use least privilege needed
```

## 8. Troubleshooting

### "Invalid config" error:
- Check config.connect format (key=value pairs)
- Ensure all required fields are present

### "Permission denied" error:
- Verify .auth file exists in database directory
- Check role name matches between config and .auth
- Ensure required permissions are granted

### "JSON parsing" error:
- Delete any manually created .tdbx files
- Let TextDBX create them automatically
- Check for empty or corrupted files

## 9. Getting Started Checklist

- [ ] Create project directory structure
- [ ] Set up config.connect file
- [ ] Create database/.auth file
- [ ] Initialize TextDBX in your code
- [ ] Insert first record (creates collection automatically)
- [ ] Query and verify data
- [ ] Set up proper permissions for your use case