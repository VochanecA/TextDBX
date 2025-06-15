// TextDBX.ts
// Lightweight, AES-encrypted, JSON-based database with enhanced error handling

import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';

interface Query {
  collection: string;
  filter?: any;
  fields?: string[];
}

interface ConnectConfig {
  database: string;
  encryptionKey: string;
  mode: 'encrypted' | 'plain';
  role: string;
}

export class TextDBX {
  private config: ConnectConfig;
  private users: any = {};
  private auth: any = {};

  constructor(connectPath: string) {
    const cfg = this.loadConfig(connectPath);
    this.config = cfg;
    this.validateConfig();
    this.ensureDatabaseDirectory();
    this.loadUsersAndAuth();
  }

  private loadConfig(file: string): ConnectConfig {
    if (!fs.existsSync(file)) {
      throw new Error(`Config file not found: ${file}\n` +
        'Please create a config.connect file with:\n' +
        'database=./database\n' +
        'encryptionKey=your-secure-key-here\n' +
        'mode=encrypted\n' +
        'role=admin');
    }

    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const cfg: any = {};
    for (let line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          cfg[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
    
    if (!cfg.database || !cfg.encryptionKey || !cfg.mode || !cfg.role) {
      throw new Error('Invalid config. Required fields: database, encryptionKey, mode, role');
    }
    
    return cfg as ConnectConfig;
  }

  private validateConfig(): void {
    // Validate mode
    if (!['encrypted', 'plain'].includes(this.config.mode)) {
      throw new Error(`Invalid mode: ${this.config.mode}. Must be 'encrypted' or 'plain'`);
    }

    // Validate encryption key strength
    if (this.config.encryptionKey.length < 32) {
      console.warn('⚠️  WARNING: Encryption key is too short (< 32 characters).');
      console.warn('   For security, use a longer key. Consider generating one:');
      console.warn('   node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"');
    }

    // Warn about plain mode with sensitive operations
    if (this.config.mode === 'plain') {
      console.warn('⚠️  WARNING: Database is in plain text mode.');
      console.warn('   Data will not be encrypted. Use mode=encrypted for production.');
    }
  }

  private ensureDatabaseDirectory(): void {
    if (!fs.existsSync(this.config.database)) {
      console.log(`📁 Creating database directory: ${this.config.database}`);
      fs.mkdirSync(this.config.database, { recursive: true });
    }
  }

  private generateSecureKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  private encrypt(data: string): string {
    try {
      const key = crypto.createHash('sha256').update(this.config.encryptionKey).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
      return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private decrypt(data: string): string {
    try {
      if (!data || !data.includes(':')) {
        throw new Error('Invalid encrypted data format');
      }
      
      const key = crypto.createHash('sha256').update(this.config.encryptionKey).digest();
      const [ivHex, encHex] = data.split(':');
      
      if (!ivHex || !encHex) {
        throw new Error('Invalid encrypted data format');
      }
      
      const iv = Buffer.from(ivHex, 'hex');
      const encrypted = Buffer.from(encHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private loadFile(collection: string): any[] {
    const filePath = path.join(this.config.database, `${collection}.tdbx`);
    
    // File doesn't exist - return empty array
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      
      // Handle empty files
      if (!raw.trim()) {
        console.warn(`⚠️  File ${collection}.tdbx is empty, initializing with empty array`);
        this.saveFile(collection, []); // Fix the empty file
        return [];
      }

      let json: string;
      
      if (this.config.mode === 'encrypted') {
        // Try to decrypt
        try {
          json = this.decrypt(raw);
        } catch (decryptError) {
          console.error(`❌ Failed to decrypt ${collection}.tdbx`);
          console.error('   This might be because:');
          console.error('   1. File was created in plain mode but config is encrypted');
          console.error('   2. Wrong encryption key');
          console.error('   3. File is corrupted');
          console.error(`   Error: ${decryptError instanceof Error ? decryptError.message : 'Unknown error'}`);
          
          // Ask user what to do
          throw new Error(`Cannot decrypt ${collection}.tdbx. Check your encryption key and mode.`);
        }
      } else {
        json = raw;
      }

      // Parse JSON with error handling
      try {
        const parsed = JSON.parse(json);
        
        // Ensure it's an array
        if (!Array.isArray(parsed)) {
          console.warn(`⚠️  ${collection}.tdbx contains non-array data, wrapping in array`);
          return [parsed];
        }
        
        return parsed;
      } catch (parseError) {
        console.error(`❌ Failed to parse JSON in ${collection}.tdbx`);
        console.error('   The file might be corrupted or contain invalid JSON');
        console.error(`   Error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        
        // Create backup of corrupted file
        const backupPath = `${filePath}.backup.${Date.now()}`;
        fs.copyFileSync(filePath, backupPath);
        console.log(`📄 Corrupted file backed up to: ${backupPath}`);
        
        // Initialize with empty array
        console.log('🔧 Initializing with empty array');
        this.saveFile(collection, []);
        return [];
      }
      
    } catch (error) {
      console.error(`❌ Error loading ${collection}.tdbx:`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  private saveFile(collection: string, data: any[]): void {
    try {
      // Ensure data is an array
      if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
      }

      const json = JSON.stringify(data, null, 2);
      const raw = this.config.mode === 'encrypted' ? this.encrypt(json) : json;
      const filePath = path.join(this.config.database, `${collection}.tdbx`);
      
      // Create backup of existing file
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.backup`;
        fs.copyFileSync(filePath, backupPath);
      }
      
      fs.writeFileSync(filePath, raw);
      
      // Verify the write was successful
      if (!fs.existsSync(filePath)) {
        throw new Error('Failed to write file');
      }
      
    } catch (error) {
      throw new Error(`Failed to save ${collection}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private loadUsersAndAuth(): void {
    const usersPath = path.join(this.config.database, '.users');
    const authPath = path.join(this.config.database, '.auth');
    
    // Load users
    if (fs.existsSync(usersPath)) {
      try {
        this.users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      } catch (error) {
        console.error('❌ Error loading .users file:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Load auth
    if (fs.existsSync(authPath)) {
      try {
        const authContent = fs.readFileSync(authPath, 'utf8');
        this.auth = JSON.parse(authContent);
      } catch (error) {
        console.error('❌ Error loading .auth file:', error instanceof Error ? error.message : 'Unknown error');
        throw new Error('Failed to load authentication configuration');
      }
    } else {
      console.warn('⚠️  No .auth file found. Creating default permissions...');
      this.createDefaultAuth();
    }
  }

  private createDefaultAuth(): void {
    const defaultAuth = {
      "admin": ["query", "insert", "update", "delete", "index"],
      "editor": ["query", "insert", "update"],
      "reader": ["query"]
    };
    
    const authPath = path.join(this.config.database, '.auth');
    fs.writeFileSync(authPath, JSON.stringify(defaultAuth, null, 2));
    this.auth = defaultAuth;
    
    console.log('✅ Created default .auth file with standard permissions');
  }

  private checkPermission(action: string): void {
    const role = this.config.role;
    
    if (!this.auth[role]) {
      throw new Error(`Role '${role}' not found in authentication configuration.\n` +
        `Available roles: ${Object.keys(this.auth).join(', ')}`);
    }
    
    if (!this.auth[role].includes(action)) {
      throw new Error(`Permission denied: Role '${role}' cannot perform '${action}'.\n` +
        `Allowed actions: ${this.auth[role].join(', ')}`);
    }
  }

  // Public method to generate secure encryption key
  public static generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  // Public method to validate collection name
  private validateCollectionName(collection: string): void {
    if (!collection || typeof collection !== 'string') {
      throw new Error('Collection name must be a non-empty string');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(collection)) {
      throw new Error('Collection name can only contain letters, numbers, underscores, and hyphens');
    }
    
    if (collection.startsWith('.')) {
      throw new Error('Collection name cannot start with a dot (reserved for system files)');
    }
  }

  public queryObject(query: Query): any[] {
    this.checkPermission('query');
    this.validateCollectionName(query.collection);
    
    const data = this.loadFile(query.collection);
    return data.filter(row => this.matchFilter(row, query.filter))
               .map(row => this.projectFields(row, query.fields));
  }

  private matchFilter(row: any, filter: any): boolean {
    if (!filter) return true;
    for (const key in filter) {
      const val = filter[key];
      if (typeof val === 'object' && val !== null && val.$contains) {
        if (!Array.isArray(row[key]) || !row[key].includes(val.$contains)) return false;
      } else if (row[key] !== val) return false;
    }
    return true;
  }

  private projectFields(row: any, fields?: string[]): any {
    if (!fields) return row;
    const projected: any = {};
    for (const f of fields) projected[f] = row[f];
    return projected;
  }

  public insert(collection: string, record: any): void {
    this.checkPermission('insert');
    this.validateCollectionName(collection);
    
    if (!record || typeof record !== 'object') {
      throw new Error('Record must be a non-null object');
    }
    
    const data = this.loadFile(collection);
    data.push(record);
    this.saveFile(collection, data);
  }

  public update(collection: string, filter: any, changes: any): number {
    this.checkPermission('update');
    this.validateCollectionName(collection);
    
    if (!changes || typeof changes !== 'object') {
      throw new Error('Changes must be a non-null object');
    }
    
    const data = this.loadFile(collection);
    let updateCount = 0;
    
    for (const row of data) {
      if (this.matchFilter(row, filter)) {
        Object.assign(row, changes);
        updateCount++;
      }
    }
    
    this.saveFile(collection, data);
    return updateCount;
  }

  public delete(collection: string, filter: any): number {
    this.checkPermission('delete');
    this.validateCollectionName(collection);
    
    const data = this.loadFile(collection);
    const originalLength = data.length;
    const filtered = data.filter(row => !this.matchFilter(row, filter));
    const deletedCount = originalLength - filtered.length;
    
    this.saveFile(collection, filtered);
    return deletedCount;
  }

  public generateIndex(collection: string, field: string): void {
    this.checkPermission('index');
    this.validateCollectionName(collection);
    
    if (!field || typeof field !== 'string') {
      throw new Error('Field name must be a non-empty string');
    }
    
    const data = this.loadFile(collection);
    const index: Record<string, number[]> = {};
    
    data.forEach((item, i) => {
      const key = item[field];
      if (key !== undefined && key !== null) {
        const keyStr = String(key);
        if (keyStr in index) {
          index[keyStr].push(i);
        } else {
          index[keyStr] = [i];
        }
      }
    });
    
    const indexPath = path.join(this.config.database, `${collection}.index.${field}.json`);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    
    console.log(`✅ Generated index for ${collection}.${field} (${Object.keys(index).length} unique values)`);
  }

  // Utility method to check database health
  public healthCheck(): { status: string; issues: string[] } {
    const issues: string[] = [];
    
    // Check database directory
    if (!fs.existsSync(this.config.database)) {
      issues.push('Database directory does not exist');
    }
    
    // Check auth file
    if (!fs.existsSync(path.join(this.config.database, '.auth'))) {
      issues.push('.auth file missing');
    }
    
    // Check encryption key strength
    if (this.config.encryptionKey.length < 32) {
      issues.push('Encryption key is too short (security risk)');
    }
    
    // Check mode vs production warning
    if (this.config.mode === 'plain') {
      issues.push('Database is in plain text mode (not recommended for production)');
    }
    
    return {
      status: issues.length === 0 ? 'healthy' : 'issues_found',
      issues
    };
  }
}