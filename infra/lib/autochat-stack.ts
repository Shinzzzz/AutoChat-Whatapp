import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";

/**
 * AutoChat infrastructure skeleton.
 *
 * VPC → RDS Postgres (Aurora Serverless v2) + ElastiCache Redis + S3 (media) +
 * Secrets Manager (per-workspace connector creds) + an ECS Fargate service for
 * `apps/web` behind an ALB, and a second Fargate service for `apps/worker`.
 *
 * This is a reference skeleton: run `pnpm --prefix infra install` then
 * `pnpm --prefix infra synth` to materialize it, and supply a built container
 * image (ECR) for the web/worker task definitions before `cdk deploy`.
 */
export class AutoChatStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2, natGateways: 1 });

    // Secrets: app secrets + per-workspace connector creds live here.
    const appSecret = new secrets.Secret(this, "AppSecret", {
      description: "AutoChat AUTH_SECRET / APP_ENCRYPTION_KEY / ANTHROPIC_API_KEY",
    });

    // PostgreSQL (Aurora Serverless v2).
    const db = new rds.DatabaseCluster(this, "Db", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      vpc,
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      writer: rds.ClusterInstance.serverlessV2("writer"),
      defaultDatabaseName: "autochat",
    });

    // Redis (ElastiCache) for BullMQ + realtime pub/sub.
    const redisSg = new ec2.SecurityGroup(this, "RedisSg", { vpc });
    const subnetGroup = new elasticache.CfnSubnetGroup(this, "RedisSubnets", {
      description: "AutoChat Redis",
      subnetIds: vpc.privateSubnets.map((s) => s.subnetId),
    });
    const redis = new elasticache.CfnCacheCluster(this, "Redis", {
      engine: "redis",
      cacheNodeType: "cache.t4g.micro",
      numCacheNodes: 1,
      vpcSecurityGroupIds: [redisSg.securityGroupId],
      cacheSubnetGroupName: subnetGroup.ref,
    });

    // S3 bucket for uploaded media / screenshots / PDFs.
    const bucket = new s3.Bucket(this, "Media", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    // Shared environment for both services.
    const environment: Record<string, string> = {
      NODE_ENV: "production",
      REDIS_URL: `redis://${redis.attrRedisEndpointAddress}:6379`,
      S3_BUCKET: bucket.bucketName,
      AWS_REGION: this.region,
    };
    const secretEnv = {
      DATABASE_URL: ecs.Secret.fromSecretsManager(db.secret!, "url"),
      AUTH_SECRET: ecs.Secret.fromSecretsManager(appSecret, "AUTH_SECRET"),
      APP_ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(appSecret, "APP_ENCRYPTION_KEY"),
      ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(appSecret, "ANTHROPIC_API_KEY"),
    };

    // Replace with your built image (ECR). Placeholder for `cdk synth`.
    const image = ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/node:22-alpine");

    // Web service (public, behind an ALB).
    const web = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Web", {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 2,
      taskImageOptions: {
        image,
        containerPort: 3000,
        environment: { ...environment, USE_QUEUE: "1" },
        secrets: secretEnv,
        command: ["pnpm", "--filter", "@autochat/web", "start"],
      },
      publicLoadBalancer: true,
    });
    web.targetGroup.configureHealthCheck({ path: "/api/health" });
    db.connections.allowDefaultPortFrom(web.service);
    redisSg.connections.allowFrom(web.service, ec2.Port.tcp(6379));
    bucket.grantReadWrite(web.taskDefinition.taskRole);

    // Worker service (private, no load balancer).
    const workerTask = new ecs.FargateTaskDefinition(this, "WorkerTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
    });
    workerTask.addContainer("worker", {
      image,
      environment,
      secrets: secretEnv,
      command: ["pnpm", "--filter", "@autochat/worker", "start"],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "worker" }),
    });
    const worker = new ecs.FargateService(this, "Worker", {
      cluster,
      taskDefinition: workerTask,
      desiredCount: 1,
    });
    db.connections.allowDefaultPortFrom(worker);
    redisSg.connections.allowFrom(worker, ec2.Port.tcp(6379));
    bucket.grantReadWrite(workerTask.taskRole);

    new cdk.CfnOutput(this, "WebUrl", { value: `http://${web.loadBalancer.loadBalancerDnsName}` });
    new cdk.CfnOutput(this, "MediaBucket", { value: bucket.bucketName });
  }
}
