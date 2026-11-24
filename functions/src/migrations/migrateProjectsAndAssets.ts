/**
 * Aura DIMS - Projects Migration (Retired)
 * 
 * NOTE: The asset/design/playlist/schedule backfill migration has been retired per instruction.
 * General projects and user memberships are now managed via `seedGeneralProjects.ts`.
 */

export { runGeneralProjectsSeeder as runMigration } from './seedGeneralProjects';

import { runGeneralProjectsSeeder } from './seedGeneralProjects';

if (require.main === module) {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = !isApply;

  console.log('[Notice] migrateProjectsAndAssets has been retired. Forwarding to seedGeneralProjects...\n');
  runGeneralProjectsSeeder({ dryRun: isDryRun })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
