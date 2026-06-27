/**
 * Generates 3 PDFs for pipeline testing:
 *   cloud-run-v1.pdf           — initial version (first pipeline run)
 *   cloud-run-v2-low-drift.pdf — minor wording edits only (drift < 0.75 → auto-apply)
 *   cloud-run-v2-high-drift.pdf — major factual changes (drift ≥ 0.75 → human review)
 *
 * Usage:
 *   npx tsx scripts/generate-seed-pdfs.ts
 */

import PDFDocument from 'pdfkit'
import * as fs from 'fs'
import * as path from 'path'

const OUT = path.join(__dirname, 'seed-data')

function writePdf(filename: string, sections: { title: string; body: string }[], subtitle: string) {
  const doc = new PDFDocument({ margin: 60 })
  doc.pipe(fs.createWriteStream(path.join(OUT, filename)))

  doc.fontSize(20).font('Helvetica-Bold').text('Google Cloud Run — Study Guide', { align: 'center' })
  doc.moveDown(0.3)
  doc.fontSize(10).font('Helvetica').fillColor('#555').text(subtitle, { align: 'center' })
  doc.moveDown(1.5)

  for (const s of sections) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text(s.title)
    doc.moveDown(0.4)
    doc.fontSize(11).font('Helvetica').text(s.body, { lineGap: 4 })
    doc.moveDown(1)
  }

  doc.end()
  console.log(`Written: ${filename}`)
}

// ── V1 — initial version ──────────────────────────────────────────────────────

writePdf('cloud-run-v1.pdf', [
  {
    title: 'Autoscaling and Concurrency',
    body:
      'Cloud Run automatically scales the number of container instances based on incoming requests. ' +
      'When there are no requests, Cloud Run scales down to zero instances, eliminating costs during idle periods. ' +
      'You can configure a minimum number of instances to keep warm and avoid cold start latency.\n\n' +
      'Maximum instances cap how many containers Cloud Run will start, protecting downstream services. ' +
      'The default maximum is 100 instances per service. Each instance handles up to 80 concurrent requests ' +
      'by default, configurable up to 1000. Cold start latency is typically 1–3 seconds for most images.',
  },
  {
    title: 'Networking',
    body:
      'Cloud Run services are accessible via HTTPS through an automatically provisioned URL. ' +
      'Custom domains can be mapped using Cloud Run domain mapping or a load balancer.\n\n' +
      'VPC Connector (Serverless VPC Access) allows Cloud Run to reach resources inside a private VPC, ' +
      'such as Cloud SQL or Memorystore. Ingress controls determine which traffic reaches the service: ' +
      'All (public internet), Internal, or Internal and Cloud Load Balancing.',
  },
  {
    title: 'Identity and Security',
    body:
      'Cloud Run services use a service account as their identity. Best practice is to create a dedicated ' +
      'service account with minimal required permissions rather than using the default Compute Engine account.\n\n' +
      'Authentication can be enforced using IAM. Unauthenticated invocations must be explicitly allowed. ' +
      'The Cloud Run Invoker role (roles/run.invoker) grants permission to call a service.',
  },
  {
    title: 'Pricing',
    body:
      'Cloud Run pricing is based on CPU, memory, and request count:\n\n' +
      '• CPU: charged per vCPU-second during request processing\n' +
      '• Memory: charged per GiB-second\n' +
      '• Requests: charged per million requests after free tier\n\n' +
      'The free tier includes 2 million requests, 360,000 vCPU-seconds, and 180,000 GiB-seconds per month.',
  },
], 'Version 1 — baseline')

// ── V2 LOW DRIFT — minor wording edits, meaning subtly changed ───────────────
// Changed facts (should score 0.3–0.6, auto-apply):
//   • default max instances: 100 → 200
//   • default concurrency: 80 → 150
//   • cold start: 1–3 s → typically under 500 ms
//   • networking: VPC Connector now optional for most use cases
//   • free tier requests: 2 million → 2.5 million

writePdf('cloud-run-v2-low-drift.pdf', [
  {
    title: 'Autoscaling and Concurrency',
    body:
      'Cloud Run automatically adjusts the number of container instances based on request volume. ' +
      'When no requests arrive, Cloud Run scales to zero instances, removing costs during idle time. ' +
      'A minimum instance count can be set to keep containers warm and reduce cold start delays.\n\n' +
      'Maximum instances limit how many containers Cloud Run may start, protecting backend services. ' +
      'The default maximum is now 200 instances per service. Each instance supports up to 150 concurrent ' +
      'requests by default, with a maximum of 1000. Cold starts typically take under 500 ms.',
  },
  {
    title: 'Networking',
    body:
      'Cloud Run services are reachable via HTTPS using an automatically generated URL. ' +
      'Custom domains may be configured through Cloud Run domain mapping or via a load balancer.\n\n' +
      'Serverless VPC Access (VPC Connector) enables Cloud Run to communicate with private VPC resources ' +
      'such as Cloud SQL or Memorystore, though it is now optional for most standard use cases. ' +
      'Ingress settings control which traffic can reach the service: ' +
      'All (public), Internal only, or Internal and Cloud Load Balancing.',
  },
  {
    title: 'Identity and Security',
    body:
      'Each Cloud Run service runs under a service account identity. The recommended practice is to provision ' +
      'a dedicated service account with least-privilege permissions rather than using the default account.\n\n' +
      'IAM-based authentication can be required for incoming calls. Unauthenticated access must be explicitly ' +
      'permitted. Use the Cloud Run Invoker role (roles/run.invoker) to grant callers access.',
  },
  {
    title: 'Pricing',
    body:
      'Cloud Run charges are based on CPU usage, memory consumption, and request volume:\n\n' +
      '• CPU: billed per vCPU-second while processing requests\n' +
      '• Memory: billed per GiB-second of usage\n' +
      '• Requests: billed per million after the free tier\n\n' +
      'Monthly free tier now covers 2.5 million requests, 360,000 vCPU-seconds, and 180,000 GiB-seconds.',
  },
], 'Version 2 — low drift (minor wording, meaning subtly changed)')

// ── V2 HIGH DRIFT — major factual changes ─────────────────────────────────────

writePdf('cloud-run-v2-high-drift.pdf', [
  {
    title: 'Autoscaling and Concurrency',
    body:
      'Cloud Run now supports predictive autoscaling in addition to reactive scaling, using historical ' +
      'traffic patterns to pre-warm instances before demand spikes. Scale-to-zero is no longer the default; ' +
      'the new default minimum is 1 instance to eliminate cold starts for production workloads.\n\n' +
      'The default concurrency limit has been raised from 80 to 500 requests per instance. ' +
      'The maximum instance count default has increased from 100 to 1000 per service. ' +
      'Cold start latency has been reduced to under 200 ms for most container images via the new ' +
      'Rapid Startup feature, which pre-loads the container runtime.',
  },
  {
    title: 'Networking',
    body:
      'Cloud Run now supports direct VPC egress without requiring a Serverless VPC Access Connector. ' +
      'Traffic to private IPs is automatically routed through the VPC, removing the connector cost and latency.\n\n' +
      'The new Private Service Connect integration replaces domain mapping for custom domains. ' +
      'Ingress now has a fourth option — "Internal and Cloud Armor" — which enables WAF rules ' +
      'for internal-facing services. IPv6 is supported end-to-end for new services.',
  },
  {
    title: 'Identity and Security',
    body:
      'Cloud Run now integrates with Workload Identity Federation, replacing long-lived service account keys ' +
      'for cross-project authentication. Service accounts must be attached explicitly; the Compute Engine ' +
      'default service account can no longer be used with Cloud Run as of this release.\n\n' +
      'Binary Authorization is now enforced by default for all new Cloud Run services, requiring ' +
      'deployed images to be attested by a configured attestor. The Cloud Run Invoker role has been ' +
      'split into roles/run.invoker (HTTP) and roles/run.jobsInvoker (Jobs).',
  },
  {
    title: 'Pricing',
    body:
      'Cloud Run pricing has moved to a new tier-based model:\n\n' +
      '• Tier 1 (0–1B requests/month): $0.30 per million requests\n' +
      '• Tier 2 (1B+ requests/month): $0.15 per million requests\n' +
      '• CPU: now charged per millisecond at $0.000024 per vCPU-ms\n' +
      '• Memory: $0.0000025 per GiB-ms\n\n' +
      'The flat monthly free tier has been replaced by a committed-use discount model. ' +
      'Minimum instances are now billed at 50% of the standard rate instead of full rate.',
  },
], 'Version 2 — high drift (major factual changes)')
