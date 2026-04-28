variable "project" {
  type        = string
  description = "Project name used in AWS resource names."
}

variable "environment" {
  type        = string
  description = "Environment name, for example dev or prod."
}

variable "aws_region" {
  type        = string
  description = "AWS region."
}

variable "image_tag" {
  type        = string
  description = "Docker image tag to deploy."
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR range for the environment VPC."
}

variable "db_username" {
  type        = string
  description = "PostgreSQL username."
}

variable "db_name" {
  type        = string
  description = "PostgreSQL database name."
}

variable "cpu" {
  type        = number
  description = "Fargate task CPU units."
}

variable "memory" {
  type        = number
  description = "Fargate task memory in MB."
}

variable "desired_count" {
  type        = number
  description = "Number of ECS tasks per service."
}

variable "enable_deletion_protection" {
  type        = bool
  description = "Enable deletion protection for production-grade resources."
}

variable "multi_az_database" {
  type        = bool
  description = "Enable RDS Multi-AZ."
}

