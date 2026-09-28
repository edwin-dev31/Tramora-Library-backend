import 'dotenv/config';
import {
  migrateRevert,
  migrateUp,
  withMigrationClient,
} from '../src/database/migration-runner.js';

const command = process.argv[2] ?? 'up';

if (command !== 'up' && command !== 'revert') {
  console.error(`Unknown command "${command}". Use "up" or "revert".`);
  process.exit(1);
}

try {
  const summary = await withMigrationClient(async (client) => {
    if (command === 'revert') {
      const reverted = await migrateRevert(client);
      
      return reverted ? `reverted ${reverted}` : 'nothing to revert';
    }

    const executed = await migrateUp(client);
    executed.forEach((file) => console.log(`applied  ${file}`));
    return executed.length
      ? `${executed.length} migration(s) applied`
      : 'already up to date';
  });

  console.log(summary);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
