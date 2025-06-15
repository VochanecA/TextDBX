// setup-textdbx.ts
// Utility to help users set up TextDBX properly

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { TextDBX } from './TextDBX';

export class TextDBXSetup {
  
  static generateSecureKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  static createProject(projectPath: string = './textdbx-project'): void {
    console.log('🚀 Setting up TextDBX project...');
    
    // Create project directory
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
      console.log(`📁 Created project directory: ${projectPath}`);
    }
    
    // Create database directory
    const dbPath = path.join(projectPath, 'database');
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
      console.log(`📁 Created database directory: ${dbPath}`);
    }
    
    // Generate secure encryption key
    const encryptionKey = this.generateSecureKey();
    
    // Create config file
    const configPath = path.join(projectPath, 'config.connect');
    const configContent = `# TextDBX Configuration
database=./database
encryptionKey=${encryptionKey}
mode=encrypted
role=admin

# Available modes: encrypted, plain
# Available roles: admin, editor, reader (defined in database/.auth)
`;
    
    fs.writeFileSync(configPath, configContent);
    console.log(`⚙️  Created config file: ${configPath}`);
    
    // Create auth file
    const authPath = path.join(dbPath, '.auth');
    const authContent = {
      "admin": ["query", "insert", "update", "delete", "index"],
      "editor": ["query", "insert", "update"],
      "reader": ["query"]
    };
    
    fs.writeFileSync(authPath, JSON.stringify(authContent, null, 2));
    console.log(`🔐 Created auth file: ${authPath}`);
    
    // Create users file
    const usersPath = path.join(dbPath, '.users');
    const usersContent = {
      "admin_user": {
        "role": "admin",
        "created": new Date().toISOString(),
        "description": "Default admin user"
      },
      "app_user": {
        "role": "editor", 
        "created": new Date().toISOString(),
        "description": "Application user with read/write access"
      }
    };
    
    fs.writeFileSync(usersPath, JSON.stringify(usersContent, null, 2));
    console.log(`👥 Created users file: ${usersPath}`);
    
    // Create example usage file
    const examplePath = path.join(projectPath, 'example.ts');
    const exampleContent = `import { TextDBX } from './TextDBX';

// Initialize TextDBX
const db = new TextDBX('./config.connect');

// Run health check
const health = db.healthCheck();
console.log('Database Health:', health);

async function example() {
  try {
    // Insert a user (this will create users.tdbx automatically)
    const user = {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
      created: new Date().toISOString()
    };
    
    console.log('Inserting user...');
    db.insert('users', user);
    
    // Query users
    console.log('Querying users...');
    const users = db.queryObject({
      collection: 'users',
      filter: { name: 'John Doe' }
    });
    console.log('Found users:', users);
    
    // Update user
    console.log('Updating user...');
    const updateCount = db.update('users', { id: 1 }, { age: 30 });
    console.log('Updated records:', updateCount);
    
    // Generate index
    console.log('Generating index...');
    db.generateIndex('users', 'email');
    
    console.log('✅ Example completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }
}

example();
`;
    
    fs.writeFileSync(examplePath, exampleContent);
    console.log(`📝 Created example file: ${examplePath}`);
    
    // Create README
    const readmePath = path.join(projectPath, 'README.md');
    const readmeContent = `# TextDBX Project

This project uses TextDBX, a lightweight encrypted JSON database.

## Files Created

- \`config.connect\` - Database configuration
- \`database/.auth\` - Role-based permissions
- \`database/.users\` - User definitions
- \`example.ts\` - Usage example

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Run the example:
   \`\`\`bash
   npx ts-node example.ts
   \`\`\`

## Security Notes

- Your encryption key is automatically generated and secure
- Database is in encrypted mode by default
- Never commit your \`config.connect\` file to version control
- Collection files (.tdbx) are created automatically - don't create them manually

## Available Roles

- **admin**: Full access (query, insert, update, delete, index)
- **editor**: Read/write access (query, insert, update)  
- **reader**: Read-only access (query)

## Database Structure

Collections are stored as \`.tdbx\` files in the database directory:
- \`users.tdbx\` - User data
- \`products.tdbx\` - Product data
- etc.

Never create these files manually - let TextDBX create them automatically when you insert data.
`;
    
    fs.writeFileSync(readmePath, readmeContent);
    console.log(`📖 Created README: ${readmePath}`);
    
    console.log('\n✅ TextDBX project setup complete!');
    console.log(`\n📁 Project location: ${path.resolve(projectPath)}`);
    console.log('\n🔑 Your secure encryption key has been generated automatically');
    console.log('⚠️  Keep your config.connect file secure and never commit it to version control');
    console.log('\n🚀 Next steps:');
    console.log(`   cd ${projectPath}`);
    console.log('   npm init -y');
    console.log('   npm install typescript ts-node @types/node');
    console.log('   npx ts-node example.ts');
  }

  static validateProject(projectPath: string = '.'): void {
    console.log('🔍 Validating TextDBX project...');
    
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Check config file
    const configPath = path.join(projectPath, 'config.connect');
    if (!fs.existsSync(configPath)) {
      issues.push('config.connect file missing');
    } else {
      try {
        const db = new TextDBX(configPath);
        const health = db.healthCheck();
        if (health.status !== 'healthy') {
          issues.push(...health.issues);
        }
      } catch (error) {
        issues.push(`Config validation failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    
    // Check for manually created .tdbx files
    const dbDir = path.join(projectPath, 'database');
    if (fs.existsSync(dbDir)) {
      const files = fs.readdirSync(dbDir).filter(f => f.endsWith('.tdbx'));
      for (const file of files) {
        const filePath = path.join(dbDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content.trim()) {
          warnings.push(`Empty .tdbx file detected: ${file} (should be deleted)`);
        }
      }
    }
    
    // Report results
    if (issues.length === 0 && warnings.length === 0) {
      console.log('✅ Project validation passed!');
    } else {
      if (issues.length > 0) {
        console.log('❌ Issues found:');
        issues.forEach(issue => console.log(`   - ${issue}`));
      }
      if (warnings.length > 0) {
        console.log('⚠️  Warnings:');
        warnings.forEach(warning => console.log(`   - ${warning}`));
      }
    }
  }

  static fixCommonIssues(projectPath: string = '.'): void {
    console.log('🔧 Fixing common TextDBX issues...');
    
    const dbDir = path.join(projectPath, 'database');
    
    // Remove empty .tdbx files
    if (fs.existsSync(dbDir)) {
      const files = fs.readdirSync(dbDir).filter(f => f.endsWith('.tdbx'));
      for (const file of files) {
        const filePath = path.join(dbDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content.trim()) {
          fs.unlinkSync(filePath);
          console.log(`🗑️  Removed empty file: ${file}`);
        }
      }
    }
    
    // Create missing .auth file
    const authPath = path.join(dbDir, '.auth');
    if (!fs.existsSync(authPath)) {
      const defaultAuth = {
        "admin": ["query", "insert", "update", "delete", "index"],
        "editor": ["query", "insert", "update"],
        "reader": ["query"]
      };
      fs.writeFileSync(authPath, JSON.stringify(defaultAuth, null, 2));
      console.log('✅ Created missing .auth file');
    }
    
    console.log('🔧 Common issues fixed!');
  }
}

// CLI usage
if (require.main === module) {
  const command = process.argv[2];
  const projectPath = process.argv[3];
  
  switch (command) {
    case 'create':
      TextDBXSetup.createProject(projectPath);
      break;
    case 'validate':
      TextDBXSetup.validateProject(projectPath);
      break;
    case 'fix':
      TextDBXSetup.fixCommonIssues(projectPath);
      break;
    case 'generate-key':
      console.log('🔑 Generated secure encryption key:');
      console.log(TextDBXSetup.generateSecureKey());
      break;
    default:
      console.log('TextDBX Setup Utility');
      console.log('');
      console.log('Usage:');
      console.log('  npx ts-node setup-textdbx.ts create [path]     - Create new project');
      console.log('  npx ts-node setup-textdbx.ts validate [path]   - Validate project');
      console.log('  npx ts-node setup-textdbx.ts fix [path]        - Fix common issues');
      console.log('  npx ts-node setup-textdbx.ts generate-key      - Generate encryption key');
  }
}