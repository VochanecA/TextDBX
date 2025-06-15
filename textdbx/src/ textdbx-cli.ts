// textdbx-cli.ts
// Simple CLI interface for TextDBX

import { TextDBX } from './TextDBX';
import * as fs from 'fs';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`Usage:
  node textdbx-cli.js <config.txt> <command> [...args]

Commands:
  query <collection> <filterJSON>
  insert <collection> <recordJSON>
  update <collection> <filterJSON> <updateJSON>
  delete <collection> <filterJSON>
  index <collection> <field>
  `);
  process.exit(1);
}

const [configPath, command, ...cmdArgs] = args;

const db = new TextDBX(configPath);

try {
  switch (command) {
    case 'query': {
      const [collection, filterJson] = cmdArgs;
      const filter = filterJson ? JSON.parse(filterJson) : {};
      const results = db.queryObject({ collection, filter });
      console.log(JSON.stringify(results, null, 2));
      break;
    }
    case 'insert': {
      const [collection, recordJson] = cmdArgs;
      const record = JSON.parse(recordJson);
      db.insert(collection, record);
      console.log('Inserted.');
      break;
    }
    case 'update': {
      const [collection, filterJson, updateJson] = cmdArgs;
      const filter = JSON.parse(filterJson);
      const update = JSON.parse(updateJson);
      db.update(collection, filter, update);
      console.log('Updated.');
      break;
    }
    case 'delete': {
      const [collection, filterJson] = cmdArgs;
      const filter = JSON.parse(filterJson);
      db.delete(collection, filter);
      console.log('Deleted.');
      break;
    }
    case 'index': {
      const [collection, field] = cmdArgs;
      db.generateIndex(collection, field);
      console.log(`Index generated on ${field}.`);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
  }
} catch (e: any) {
  console.error('Error:', e.message);
  process.exit(1);
}
