import PDFDocument from 'pdfkit'
import * as fs from 'fs'
import * as path from 'path'

const out = path.join(__dirname, 'seed-data', 'gcp-cloud-run-guide.pdf')
const doc = new PDFDocument({ margin: 60 })
doc.pipe(fs.createWriteStream(out))

// Page 1
doc.fontSize(20).font('Helvetica-Bold').text('Google Cloud Run — Architecture Guide', { align: 'center' })
doc.moveDown(0.5)
doc.fontSize(10).font('Helvetica').fillColor('#555').text('Study reference for Google Cloud Professional Architect exam', { align: 'center' })
doc.moveDown(1.5)

doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text('What is Cloud Run?')
doc.moveDown(0.4)
doc.fontSize(11).font('Helvetica').text(
  'Cloud Run is a fully managed compute platform that automatically scales stateless containers. ' +
  'It abstracts away all infrastructure management so you can focus on building great applications. ' +
  'Cloud Run is built on Knative, the open-source Kubernetes-based platform, and can run any container ' +
  'that listens for HTTP requests on a configurable port (default 8080).',
  { lineGap: 4 }
)
doc.moveDown()

doc.fontSize(14).font('Helvetica-Bold').text('Key Concepts')
doc.moveDown(0.4)
doc.fontSize(11).font('Helvetica').text(
  'Services: The primary resource in Cloud Run. A service exposes a unique endpoint and automatically ' +
  'scales the underlying infrastructure to handle incoming requests.\n\n' +
  'Revisions: Every deployment creates an immutable revision. Traffic can be split between revisions ' +
  'for canary deployments and rollbacks.\n\n' +
  'Containers: Cloud Run executes your code packaged in a container image. Images must be stored in ' +
  'Artifact Registry or Container Registry.',
  { lineGap: 4 }
)
doc.moveDown()

doc.fontSize(14).font('Helvetica-Bold').text('Concurrency and Scaling')
doc.moveDown(0.4)
doc.fontSize(11).font('Helvetica').text(
  'Each Cloud Run instance can handle multiple requests concurrently (default: 80, max: 1000). ' +
  'Cloud Run scales to zero when there are no incoming requests, which eliminates costs during idle periods. ' +
  'Minimum instances can be configured to keep warm instances available and avoid cold start latency.\n\n' +
  'Maximum instances cap the number of containers Cloud Run will start, which protects downstream ' +
  'services and controls costs. The default maximum is 100 instances per service.',
  { lineGap: 4 }
)

// Page 2
doc.addPage()
doc.fontSize(14).font('Helvetica-Bold').text('Request Handling and Limits')
doc.moveDown(0.4)
doc.fontSize(11).font('Helvetica').text(
  'Cloud Run has a maximum request timeout of 3600 seconds (1 hour). Requests that exceed this ' +
  'timeout are terminated. For long-running workloads, Cloud Run Jobs is the recommended alternative.\n\n' +
  'Memory limits range from 128 MiB to 32 GiB per instance. CPU is allocated only during request ' +
  'processing by default, but "CPU always allocated" mode keeps CPU available between requests for ' +
  'background tasks.\n\n' +
  'Startup CPU boost temporarily allocates additional CPU during instance startup to reduce cold start times.',
  { lineGap: 4 }
)
doc.moveDown()

doc.fontSize(14).font('Helvetica-Bold').text('Networking')
doc.moveDown(0.4)
doc.fontSize(11).font('Helvetica').text(
  'Cloud Run services are accessible via HTTPS by default through an automatically provisioned URL. ' +
  'Custom domains can be mapped using Cloud Run domain mapping or a load balancer.\n\n' +
  'VPC Connector (Serverless VPC Access) allows Cloud Run to connect to resources in a VPC network, ' +
  'such as Cloud SQL instances or Memorystore. Traffic can be routed through the VPC for all outbound ' +
  'requests or only for private IP destinations.\n\n' +
  'Ingress controls determine which traffic can reach a service: All (public), Internal, or ' +
  'Internal and Cloud Load Balancing.',
  { lineGap: 4 }
)
doc.moveDown()

doc.fontSize(14).font('Helvetica-Bold').text('Identity and Access')
doc.moveDown(0.4)
doc.fontSize(11).font('Helvetica').text(
  'Cloud Run services use a service account as their identity. By default, the Compute Engine ' +
  'default service account is used, but best practice is to create a dedicated service account ' +
  'with minimal required permissions.\n\n' +
  'Authentication can be required using IAM. Unauthenticated invocations must be explicitly allowed. ' +
  'The Cloud Run Invoker role (roles/run.invoker) grants permission to call a service.',
  { lineGap: 4 }
)

// Page 3
doc.addPage()
doc.fontSize(14).font('Helvetica-Bold').text('Cloud Run Jobs')
doc.moveDown(0.4)
doc.fontSize(11).font('Helvetica').text(
  'Cloud Run Jobs execute code that runs to completion rather than serving HTTP requests. Jobs are ' +
  'suitable for data processing pipelines, batch operations, and scheduled tasks.\n\n' +
  'A job consists of one or more tasks that can run in parallel. Each task runs one instance of ' +
  'the container. Tasks that fail can be retried up to a configurable maximum.',
  { lineGap: 4 }
)
doc.moveDown()

doc.fontSize(14).font('Helvetica-Bold').text('Pricing')
doc.moveDown(0.4)
doc.fontSize(11).font('Helvetica').text(
  'Cloud Run pricing is based on CPU, memory, and requests:\n\n' +
  '• CPU: charged per vCPU-second during request processing (or always, if CPU always allocated)\n' +
  '• Memory: charged per GiB-second\n' +
  '• Requests: charged per million requests after free tier\n\n' +
  'The free tier includes 2 million requests, 360,000 vCPU-seconds, and 180,000 GiB-seconds per month. ' +
  'Minimum instance hours are charged at the CPU always-allocated rate even when idle.',
  { lineGap: 4 }
)
doc.moveDown()

doc.fontSize(14).font('Helvetica-Bold').text('Exam Key Points')
doc.moveDown(0.4)
doc.fontSize(11).font('Helvetica').text(
  '1. Cloud Run scales to zero — eliminates costs when idle, introduces cold start latency.\n' +
  '2. Maximum concurrency default is 80 requests per instance; adjust based on workload memory needs.\n' +
  '3. Use minimum instances to guarantee low latency for latency-sensitive services.\n' +
  '4. VPC Connector required for private network resource access (Cloud SQL, Memorystore).\n' +
  '5. Cloud Run Jobs for batch workloads; Cloud Run Services for HTTP workloads.\n' +
  '6. Revisions are immutable — traffic splits enable safe progressive rollouts.',
  { lineGap: 6 }
)

doc.end()
console.log(`PDF written to ${out}`)
