import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!, { ssl: 'require', prepare: false });

async function main() {
  await client`TRUNCATE TABLE
    drift_items,
    pipeline_stages,
    learning_unit_versions,
    topic_extractions,
    proposed_topics,
    pipeline_runs,
    learning_units,
    source_versions,
    topics,
    sources
  CASCADE`;
  console.log('All tables truncated.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
