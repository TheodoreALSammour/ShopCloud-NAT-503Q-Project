# Phase 2 Infrastructure

This folder contains a Terraform starter for deploying ShopCloud on AWS.

## Target Architecture

- ECS Fargate runs the five Node.js services.
- ECR stores Docker images for each service.
- RDS PostgreSQL stores users, products, orders, invoices, and returns.
- ElastiCache Redis stores carts.
- A public Application Load Balancer exposes customer-facing APIs.
- An internal Application Load Balancer exposes the admin service only inside the VPC.
- Dev and prod are deployed as separate Terraform workspaces/environments using separate state files and resource names.

## Prerequisites

Install and configure:

- AWS CLI
- Terraform
- Docker
- GitHub repository secrets for CI/CD

Required GitHub secrets:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
TF_STATE_BUCKET
```

## Local Terraform Commands

Create the remote state backend once per AWS account:

```powershell
cd infra\bootstrap
Copy-Item terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
cd ..
```

Copy the backend examples if the local backend files do not already exist:

```powershell
Copy-Item backend-dev.hcl.example backend-dev.hcl
Copy-Item backend-prod.hcl.example backend-prod.hcl
```

The repo includes `dev.tfvars.json` and `prod.tfvars.json` with non-secret defaults.
Review these values before deploying, especially `aws_region`, `vpc_cidr`, and production sizing.

```powershell
Get-Content infra\dev.tfvars.json
Get-Content infra\prod.tfvars.json
```

Initialize Terraform:

```powershell
cd infra
terraform init -backend-config="backend-dev.hcl"
```

Plan dev:

```powershell
terraform plan -var-file="dev.tfvars.json"
```

Apply dev:

```powershell
terraform apply -var-file="dev.tfvars.json"
```

Switch to the production backend before planning or applying production:

```powershell
terraform init -reconfigure -backend-config="backend-prod.hcl"
```

Plan prod:

```powershell
terraform plan -var-file="prod.tfvars.json"
```

Apply prod:

```powershell
terraform apply -var-file="prod.tfvars.json"
```

## Important Notes

- The `image_tag` variable should match the Git commit SHA deployed by GitHub Actions.
- The admin load balancer is internal. It is not reachable from the public internet.
- Production should use stronger sizing and deletion protection than development.
- Do not commit `.tfvars` files containing real secrets or account-specific values.
