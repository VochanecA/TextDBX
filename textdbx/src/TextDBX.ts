// TextDBX.ts
// Lightweight, AES-encrypted, JSON-based database

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
    this.loadUsersAndAuth();
  }

  private loadConfig(file: string): ConnectConfig {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const cfg: any = {};
    for (let line of lines) {
      const [key, value] = line.split('=');
      if (key && value) cfg[key.trim()] = value.trim();
    }
    if (!cfg.database || !cfg.encryptionKey || !cfg.mode || !cfg.role) throw new Error('Invalid config');
    return cfg as ConnectConfig;
  }

  private encrypt(data: string): string {
    const key = crypto.createHash('sha256').update(this.config.encryptionKey).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  private decrypt(data: string): string {
    const key = crypto.createHash('sha256').update(this.config.encryptionKey).digest();
    const [ivHex, encHex] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private loadFile(collection: string): any[] {
    const filePath = path.join(this.config.database, `${collection}.tdbx`);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = this.config.mode === 'encrypted' ? this.decrypt(raw) : raw;
    return JSON.parse(json);
  }

  private saveFile(collection: string, data: any[]): void {
    const json = JSON.stringify(data, null, 2);
    const raw = this.config.mode === 'encrypted' ? this.encrypt(json) : json;
    fs.writeFileSync(path.join(this.config.database, `${collection}.tdbx`), raw);
  }

  private loadUsersAndAuth(): void {
    const usersPath = path.join(this.config.database, '.users');
    const authPath = path.join(this.config.database, '.auth');
    if (fs.existsSync(usersPath)) this.users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    if (fs.existsSync(authPath)) this.auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  }

  private checkPermission(action: string) {
    const role = this.config.role;
    if (!this.auth[role] || !this.auth[role].includes(action)) {
      throw new Error(`Permission denied for ${action}`);
    }
  }

  public queryObject(query: Query): any[] {
    this.checkPermission('query');
    const data = this.loadFile(query.collection);
    return data.filter(row => this.matchFilter(row, query.filter))
               .map(row => this.projectFields(row, query.fields));
  }

  private matchFilter(row: any, filter: any): boolean {
    if (!filter) return true;
    for (const key in filter) {
      const val = filter[key];
      if (typeof val === 'object' && val.$contains) {
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
    const data = this.loadFile(collection);
    data.push(record);
    this.saveFile(collection, data);
  }

  public update(collection: string, filter: any, changes: any): void {
    this.checkPermission('update');
    const data = this.loadFile(collection);
    for (const row of data) {
      if (this.matchFilter(row, filter)) Object.assign(row, changes);
    }
    this.saveFile(collection, data);
  }

  public delete(collection: string, filter: any): void {
    this.checkPermission('delete');
    const data = this.loadFile(collection);
    const filtered = data.filter(row => !this.matchFilter(row, filter));
    this.saveFile(collection, filtered);
  }

  public generateIndex(collection: string, field: string): void {
    this.checkPermission('index');
    const data = this.loadFile(collection);
    const index: Record<string, number[]> = {};
    data.forEach((item, i) => {
      const key = item[field];
      if (key in index) index[key].push(i);
      else index[key] = [i];
    });
    const indexPath = path.join(this.config.database, `${collection}.index.${field}.json`);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }
}
