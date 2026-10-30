/**
 * Aura DIMS - Cloud Run Invoker Policy Provisioner (Rate-Limit Safe)
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 */

import fs from 'node:fs';
import path from 'node:path';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const configPath = path.join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json');
  const tokenData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = tokenData.tokens?.access_token;
  const projectId = 'aura-dims';
  const region = 'asia-south1';

  console.log(`[Aura DIMS] Inspecting Cloud Run services in ${region}...`);
  const listRes = await fetch(
    `https://run.googleapis.com/v1/projects/${projectId}/locations/${region}/services`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const listData = await listRes.json();
  const services = (listData.items || []).map((item) => item.metadata.name);
  console.log(`[Aura DIMS] Checking ${services.length} services...`);

  let updatedCount = 0;
  let alreadyHasCount = 0;
  let failCount = 0;

  for (const name of services) {
    const getUrl = `https://run.googleapis.com/v1/projects/${projectId}/locations/${region}/services/${name}:getIamPolicy`;
    try {
      const getRes = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      const currentPolicy = await getRes.json();
      const hasInvoker = currentPolicy.bindings?.some(
        (b) => b.role === 'roles/run.invoker' && b.members?.includes('allUsers')
      );

      if (hasInvoker) {
        alreadyHasCount++;
        continue;
      }

      console.log(`> Granting invoker to ${name}...`);
      await sleep(1500); // Respect Google Cloud Run write quota per minute

      const setUrl = `https://run.googleapis.com/v1/projects/${projectId}/locations/${region}/services/${name}:setIamPolicy`;
      const setRes = await fetch(setUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          policy: {
            bindings: [
              ...(currentPolicy.bindings || []),
              {
                role: 'roles/run.invoker',
                members: ['allUsers'],
              },
            ],
          },
        }),
      });

      if (setRes.ok) {
        updatedCount++;
        console.log(`+ Successfully granted: ${name}`);
      } else {
        failCount++;
        const err = await setRes.text();
        console.error(`- Failed ${name}: ${err}`);
      }
    } catch (e) {
      failCount++;
      console.error(`- Exception on ${name}:`, e);
    }
  }

  console.log(
    `\n[Aura DIMS] Invoker setup complete: ${alreadyHasCount} already configured, ${updatedCount} updated, ${failCount} failed.`
  );
}

main().catch(console.error);
