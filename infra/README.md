# AutoChat infrastructure (AWS CDK)

Reference IaC for deploying AutoChat to AWS. **Standalone** — not part of the pnpm
workspace, so install it on its own.

Provisions:

- **VPC** (2 AZs, 1 NAT)
- **RDS** Aurora Serverless v2 PostgreSQL (`autochat` database)
- **ElastiCache** Redis (BullMQ queues + SSE realtime pub/sub)
- **S3** bucket for media / screenshots / quotation PDFs / invoices
- **Secrets Manager** for `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY` and
  per-workspace connector credentials
- **ECS Fargate**: a public `web` service behind an ALB (health check `/api/health`) and a
  private `worker` service

## Usage

```bash
cd infra
pnpm install          # or npm install
pnpm synth            # render the CloudFormation template
# Build & push your container image to ECR, set it in lib/autochat-stack.ts,
# then:
cdk bootstrap
pnpm deploy
```

> The task definitions use a placeholder public Node image so `cdk synth` works out of the
> box. Replace `ecs.ContainerImage.fromRegistry(...)` with your ECR image
> (`ecs.ContainerImage.fromEcrRepository(...)`) built from the repo's `Dockerfile` before
> deploying. The web service runs with `USE_QUEUE=1` so AI runs are handled by the worker.
