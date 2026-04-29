# Demo Checklist

## Before The Meeting

- Confirm the latest `Deploy Dev` GitHub Actions run completed successfully on `main`.
- Open the Terraform output `public_api_url` and verify the frontend loads.
- Verify ECS shows running tasks for `frontend`, `auth`, `catalog`, `cart`, `checkout`, and `admin`.
- Verify target groups are healthy in EC2 Load Balancing.
- Verify RDS PostgreSQL and ElastiCache Redis are available.
- Retrieve the admin registration secret when needed:

```powershell
cd infra
$secretName = terraform output -raw admin_registration_secret_name
aws secretsmanager get-secret-value --secret-id $secretName --query SecretString --output text
```

## Demo Flow

1. Open the `public_api_url` Terraform output in the browser.
2. Register a customer and show product catalog loading from the catalog service.
3. Add products to the cart and show Redis-backed cart state.
4. Checkout and show the order plus generated invoice PDF.
5. Register or log in as an admin using the admin registration secret.
6. Show dashboard metrics, inventory update, and return processing.
7. Open GitHub Actions and show the deploy run: Terraform init, ECR creation, image build/push, and Terraform apply.
8. Open AWS Console and show ECS services, ECR image tags, load balancers, RDS, Redis, Secrets Manager, and CloudWatch logs.

## Useful AWS Checks

```powershell
aws ecs list-clusters
aws ecr describe-repositories --query "repositories[?contains(repositoryName, 'shopcloud')].repositoryName"
aws elbv2 describe-load-balancers --query "LoadBalancers[?contains(LoadBalancerName, 'shopcloud')].[LoadBalancerName,DNSName,Scheme]"
aws rds describe-db-instances --query "DBInstances[?contains(DBInstanceIdentifier, 'shopcloud')].[DBInstanceIdentifier,DBInstanceStatus]"
aws elasticache describe-cache-clusters --query "CacheClusters[?contains(CacheClusterId, 'shopcloud')].[CacheClusterId,CacheClusterStatus]"
```
