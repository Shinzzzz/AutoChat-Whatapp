#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { AutoChatStack } from "../lib/autochat-stack.js";

const app = new cdk.App();

new AutoChatStack(app, "AutoChat", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-south-1",
  },
  description: "AutoChat — AI omnichannel platform (web + worker on ECS Fargate)",
});
