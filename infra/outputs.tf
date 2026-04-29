output "public_api_url" {
  description = "Public API load balancer URL."
  value       = "http://${aws_lb.public.dns_name}"
}

output "internal_admin_url" {
  description = "Internal admin load balancer URL. Reachable only inside the VPC."
  value       = "http://${aws_lb.internal.dns_name}"
}

output "ecr_repositories" {
  description = "ECR repositories by service."
  value = {
    for name, repo in aws_ecr_repository.service : name => repo.repository_url
  }
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "admin_registration_secret_name" {
  description = "Secrets Manager name containing the admin registration secret."
  value       = aws_secretsmanager_secret.admin_registration_secret.name
}
