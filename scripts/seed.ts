import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sources, topics } from '../src/db/schema'

// Create client here (after loadEnvConfig) instead of importing shared db
// to avoid ESM hoisting causing DATABASE_URL to be undefined
const client = postgres(process.env.DATABASE_URL!, { ssl: 'require', prepare: false })
const db = drizzle(client, { schema: { sources, topics } })

async function seed() {
  console.log('Seeding sources and topics...')

  // --- Source 1: URL ---
  const [urlSource] = await db.insert(sources).values({
    name: 'Google Cloud Run Documentation',
    type: 'url',
    url: 'https://cloud.google.com/run/docs/overview/what-is-cloud-run',
  }).returning()
  console.log('Created URL source:', urlSource.id)

  await db.insert(topics).values([
    {
      sourceId: urlSource.id,
      name: 'What is Cloud Run',
      description: 'Core concept of Cloud Run: fully managed serverless container platform, how it works, when to use it over GKE or App Engine.',
    },
    {
      sourceId: urlSource.id,
      name: 'Autoscaling and Concurrency',
      description: 'How Cloud Run scales to zero, configuring minimum and maximum instances, concurrency per instance, and cold start implications.',
    },
  ])
  console.log('Created 2 topics for URL source')

  // --- Source 2: PDF (seed-data/gcp-cloud-run-guide.pdf) ---
  const [pdfSource] = await db.insert(sources).values({
    name: 'GCP Cloud Run Architecture Guide',
    type: 'pdf',
    url: null,
  }).returning()
  console.log('Created PDF source:', pdfSource.id)

  await db.insert(topics).values([
    {
      sourceId: pdfSource.id,
      name: 'Networking and VPC',
      description: 'Cloud Run networking: ingress controls, VPC Connector for private network access, custom domains, and load balancer integration.',
    },
    {
      sourceId: pdfSource.id,
      name: 'Pricing and Resource Limits',
      description: 'Cloud Run pricing model (CPU, memory, requests), free tier limits, minimum instance billing, and memory/CPU configuration options.',
    },
    {
      sourceId: pdfSource.id,
      name: 'Identity and Security',
      description: 'Service account identity, IAM authentication, Cloud Run Invoker role, and best practices for least-privilege access.',
    },
  ])
  console.log('Created 3 topics for PDF source')

  console.log('\nDone. Next steps:')
  console.log('1. npm run dev')
  console.log('2. Go to http://localhost:3000/admin/sources')
  console.log('3. For URL source — click "Run Pipeline" directly')
  console.log('4. For PDF source — upload scripts/seed-data/gcp-cloud-run-guide.pdf then run pipeline')
  process.exit(0)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
