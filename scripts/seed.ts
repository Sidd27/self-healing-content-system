/**
 * Seeds two PDF sources for end-to-end pipeline testing.
 *
 * Source A — Low Drift Test
 *   Step 1: Upload cloud-run-v1.pdf → Run Pipeline → learning units generated
 *   Step 2: Upload cloud-run-v2-low-drift.pdf → Run Pipeline → drift < 0.75 → auto-applied
 *
 * Source B — High Drift Test
 *   Step 1: Upload cloud-run-v1.pdf → Run Pipeline → learning units generated
 *   Step 2: Upload cloud-run-v2-high-drift.pdf → Run Pipeline → drift ≥ 0.75 → review queue
 *
 * PDFs are in scripts/seed-data/. Regenerate with: npx tsx scripts/generate-seed-pdfs.ts
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sources, topics } from '../src/db/schema'

const client = postgres(process.env.DATABASE_URL!, { ssl: 'require', prepare: false })
const db = drizzle(client, { schema: { sources, topics } })

async function seed() {
  console.log('Seeding...\n')

  // ── Source A: Low Drift ───────────────────────────────────────────────────────
  const [sourceA] = await db.insert(sources).values({
    name: 'Cloud Run Guide — Low Drift Test',
    type: 'pdf',
    url: null,
  }).returning()

  await db.insert(topics).values([
    {
      sourceId: sourceA.id,
      name: 'Autoscaling and Concurrency',
      description: 'How Cloud Run scales instances based on traffic, configures min/max instances, concurrency per instance, and cold start behaviour.',
    },
    {
      sourceId: sourceA.id,
      name: 'Networking',
      description: 'HTTPS endpoints, custom domains, VPC Connector for private network access, and ingress controls.',
    },
  ])

  console.log('Source A (Low Drift):', sourceA.id)
  console.log('  Upload: cloud-run-v1.pdf → Run Pipeline → generates learning units')
  console.log('  Then:   cloud-run-v2-low-drift.pdf → Run Pipeline → drift < 0.75 → auto-applied\n')

  // ── Source B: High Drift ──────────────────────────────────────────────────────
  const [sourceB] = await db.insert(sources).values({
    name: 'Cloud Run Guide — High Drift Test',
    type: 'pdf',
    url: null,
  }).returning()

  await db.insert(topics).values([
    {
      sourceId: sourceB.id,
      name: 'Autoscaling and Concurrency',
      description: 'How Cloud Run scales instances based on traffic, configures min/max instances, concurrency per instance, and cold start behaviour.',
    },
    {
      sourceId: sourceB.id,
      name: 'Identity and Security',
      description: 'Service account identity, IAM authentication, Cloud Run Invoker role, and best practices for least-privilege access.',
    },
  ])

  console.log('Source B (High Drift):', sourceB.id)
  console.log('  Upload: cloud-run-v1.pdf → Run Pipeline → generates learning units')
  console.log('  Then:   cloud-run-v2-high-drift.pdf → Run Pipeline → drift ≥ 0.75 → review queue\n')

  console.log('PDFs are in scripts/seed-data/')
  console.log('Regenerate PDFs: npx tsx scripts/generate-seed-pdfs.ts')

  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })
