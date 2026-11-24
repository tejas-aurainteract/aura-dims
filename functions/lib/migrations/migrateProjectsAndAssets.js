"use strict";
/**
 * Aura DIMS - Projects Migration (Retired)
 *
 * NOTE: The asset/design/playlist/schedule backfill migration has been retired per instruction.
 * General projects and user memberships are now managed via `seedGeneralProjects.ts`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = void 0;
var seedGeneralProjects_1 = require("./seedGeneralProjects");
Object.defineProperty(exports, "runMigration", { enumerable: true, get: function () { return seedGeneralProjects_1.runGeneralProjectsSeeder; } });
const seedGeneralProjects_2 = require("./seedGeneralProjects");
if (require.main === module) {
    const args = process.argv.slice(2);
    const isApply = args.includes('--apply');
    const isDryRun = !isApply;
    console.log('[Notice] migrateProjectsAndAssets has been retired. Forwarding to seedGeneralProjects...\n');
    (0, seedGeneralProjects_2.runGeneralProjectsSeeder)({ isDryRun })
        .then(() => process.exit(0))
        .catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=migrateProjectsAndAssets.js.map