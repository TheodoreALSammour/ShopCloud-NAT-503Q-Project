# Rollback Instructions

## Application Rollback

Each deployment uses a Docker image tag based on the Git commit SHA.

1. Open the last successful GitHub Actions deployment.
2. Find the previous known-good commit SHA.
3. Re-run the deployment workflow with `image_tag` set to that SHA, or update the Terraform variable to that SHA and apply.
4. Verify all health checks.

## ECS Manual Rollback

1. Open the ECS cluster in AWS.
2. Select the affected service.
3. Open the task definition history.
4. Select the previous working revision.
5. Update the service to use that revision.
6. Wait for the deployment to stabilize.

## Database Rollback

Database rollback should be treated carefully because orders and customer records are stateful.

1. Prefer forward fixes for schema/application bugs.
2. If data is corrupted, restore the latest RDS snapshot into a new database instance.
3. Validate the restored database.
4. Point the affected environment to the restored endpoint during a maintenance window.

## Verification

After rollback, verify:

```powershell
curl.exe http://PUBLIC_ALB_URL/health
curl.exe http://PUBLIC_ALB_URL/products
```

Then run the customer checkout flow from the main README.

