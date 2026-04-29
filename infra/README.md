# Phase 2 Infrastructure

This folder contains a Terraform starter for deploying ShopCloud on AWS.

## Target Architecture

- ECS Fargate runs the six Node.js services: frontend, auth, catalog, cart, checkout, and admin.
- ECR stores Docker images for each service.
- RDS PostgreSQL stores users, products, orders, invoices, and returns.
- ElastiCache Redis stores carts.
- A public Application Load Balancer exposes customer-facing APIs.
- The frontend is exposed through the public load balancer and proxies browser API requests.
- An internal Application Load Balancer exposes the admin service only inside the VPC.
- Dev and prod are deployed as separate environments.
- Each environment can be deployed independently to the US and Europe using separate state files and region-specific resource names.

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

GitHub Actions builds and pushes these service images to ECR:

```text
auth
catalog
cart
checkout
admin
frontend
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
Copy-Item backend-dev-us.hcl.example backend-dev-us.hcl
Copy-Item backend-dev-eu.hcl.example backend-dev-eu.hcl
Copy-Item backend-prod-us.hcl.example backend-prod-us.hcl
Copy-Item backend-prod-eu.hcl.example backend-prod-eu.hcl
```

The repo includes region-specific non-secret defaults:

- `dev-us.tfvars.json` deploys dev to `us-east-1`.
- `dev-eu.tfvars.json` deploys dev to `eu-central-1`.
- `prod-us.tfvars.json` deploys prod to `us-east-1`.
- `prod-eu.tfvars.json` deploys prod to `eu-central-1`.

Review these values before deploying, especially `aws_region`, `vpc_cidr`, and production sizing.

```powershell
Get-Content infra\dev-us.tfvars.json
Get-Content infra\dev-eu.tfvars.json
Get-Content infra\prod-us.tfvars.json
Get-Content infra\prod-eu.tfvars.json
```

## Deploy Dev To The US

```powershell
cd infra
terraform init -reconfigure -backend-config="backend-dev-us.hcl"
terraform plan -var-file="dev-us.tfvars.json"
terraform apply -var-file="dev-us.tfvars.json"
```

## Deploy Dev To Europe

```powershell
cd infra
terraform init -reconfigure -backend-config="backend-dev-eu.hcl"
terraform plan -var-file="dev-eu.tfvars.json"
terraform apply -var-file="dev-eu.tfvars.json"
```

## Deploy Prod To The US

```powershell
cd infra
terraform init -reconfigure -backend-config="backend-prod-us.hcl"
terraform plan -var-file="prod-us.tfvars.json"
terraform apply -var-file="prod-us.tfvars.json"
```

## Deploy Prod To Europe

```powershell
cd infra
terraform init -reconfigure -backend-config="backend-prod-eu.hcl"
terraform plan -var-file="prod-eu.tfvars.json"
terraform apply -var-file="prod-eu.tfvars.json"
```

## Important Notes

- The `image_tag` variable should match the Git commit SHA deployed by GitHub Actions.
- The public `public_api_url` Terraform output opens the frontend at `/` and exposes customer APIs on their service paths.
- The admin load balancer is internal. It is not reachable from the public internet.
- Retrieve the admin registration secret from the `admin_registration_secret_name` Terraform output when you need to create a demo admin account.
- Production should use stronger sizing and deletion protection than development.
- Do not commit `.tfvars` files containing real secrets or account-specific values.
