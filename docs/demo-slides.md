# ShopCloud Demo Slides

## Slide 1: Final Architecture

ShopCloud is deployed on AWS as containerized microservices running on ECS Fargate.

```text
GitHub Actions
  -> Terraform creates/updates AWS infrastructure
  -> Docker builds images for auth, catalog, cart, checkout, admin, frontend
  -> Images are pushed to ECR with the Git commit SHA
  -> ECS services are updated to the deployed image tag

Internet
  -> Public Application Load Balancer
  -> Frontend ECS service
       -> /api/auth, /api/catalog, /api/cart, /api/checkout proxy to public API routes
       -> /api/admin proxies privately to the internal admin load balancer
  -> Public API routes for customer services:
       /register, /login, /me -> Auth
       /products              -> Catalog
       /cart                  -> Cart
       /checkout, /orders     -> Checkout

Private subnets
  -> ECS Fargate services
  -> Internal Application Load Balancer for Admin
  -> RDS PostgreSQL for durable application data
  -> ElastiCache Redis for cart data
  -> Secrets Manager for database, JWT, and admin registration secrets
  -> CloudWatch Logs for service logs
```

## Slide 2: Automation Status

Automated:

- Remote Terraform state backend support through S3 backend configuration.
- VPC, public/private subnets, route tables, internet gateway, NAT gateway, and security groups.
- ECR repositories for every deployed service, including the frontend.
- Docker image build and push from GitHub Actions.
- ECS Fargate cluster, task definitions, services, target groups, and ALB listener rules.
- RDS PostgreSQL, ElastiCache Redis, Secrets Manager secrets, and CloudWatch log groups.
- Dev deployment on push to `main`; prod deployment through manual workflow dispatch.
- Image versioning by Git commit SHA for traceable deployments and rollback.

Still remaining for a fully production-grade AWS deployment:

- HTTPS certificates and Route 53 custom domain names.
- OIDC-based GitHub-to-AWS authentication instead of long-lived access keys.
- Database migrations as a controlled CI/CD step rather than service startup initialization.
- Blue/green or canary deployments with automatic rollback alarms.
- Centralized dashboards and alerts for latency, errors, ECS health, RDS, and Redis.
- WAF/rate limiting and stricter production secret rotation policies.

## Slide 3: Deployed Service Features And Communication

- Frontend: serves the ShopCloud browser UI and proxies same-origin `/api/*` requests to backend services. It reaches the internal admin ALB from inside the VPC so the admin API remains private.
- Auth: handles customer/admin registration, login, JWT issuance, and `/me`; stores users in PostgreSQL and reads the admin registration secret from Secrets Manager.
- Catalog: exposes public product listing and product details; stores product inventory in PostgreSQL and seeds default demo products when empty.
- Cart: stores each authenticated customer's cart in Redis using the JWT user id.
- Checkout: reads cart data from Redis, validates product stock in PostgreSQL, creates orders and order items, updates inventory, clears Redis cart data, and generates invoice records/PDFs.
- Admin: exposes dashboard metrics, inventory management, and return processing; talks to PostgreSQL and is only reachable through the internal ALB or the frontend proxy.
- PostgreSQL: persistent store for users, products, orders, order items, invoices, and returns.
- Redis: fast temporary store for active shopping carts.
