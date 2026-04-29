data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  region_slug = replace(var.aws_region, "-", "")
  name        = "${var.project}-${var.environment}-${local.region_slug}"

  services = {
    auth = {
      port        = 3000
      dockerfile  = "services/auth/Dockerfile"
      health_path = "/health"
      public      = true
      paths       = ["/register", "/login", "/me"]
    }
    catalog = {
      port        = 3001
      dockerfile  = "services/catalog/Dockerfile"
      health_path = "/health"
      public      = true
      paths       = ["/products", "/products/*"]
    }
    cart = {
      port        = 3002
      dockerfile  = "services/cart/Dockerfile"
      health_path = "/health"
      public      = true
      paths       = ["/cart", "/cart/*"]
    }
    checkout = {
      port        = 3003
      dockerfile  = "services/checkout/Dockerfile"
      health_path = "/health"
      public      = true
      paths       = ["/checkout", "/orders/*"]
    }
    admin = {
      port        = 3004
      dockerfile  = "services/admin/Dockerfile"
      health_path = "/health"
      public      = false
      paths       = ["/*"]
    }
    frontend = {
      port        = 5173
      dockerfile  = "services/frontend/Dockerfile"
      health_path = "/health"
      public      = true
      paths       = ["/*"]
    }
  }

  public_services = {
    for name, service in local.services : name => service if service.public
  }

  private_services = {
    for name, service in local.services : name => service if !service.public
  }

  common_tags = {
    Project     = var.project
    Environment = var.environment
    Region      = var.aws_region
    ManagedBy   = "terraform"
  }
}

resource "random_password" "db_password" {
  length           = 24
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "random_password" "jwt_secret" {
  length  = 32
  special = true
}

resource "random_password" "admin_registration_secret" {
  length  = 20
  special = false
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = local.name
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name}-igw"
  })
}

resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-public-${count.index + 1}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(local.common_tags, {
    Name = "${local.name}-private-${count.index + 1}"
    Tier = "private"
  })
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${local.name}-nat-eip"
  })
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(local.common_tags, {
    Name = "${local.name}-nat"
  })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-public-rt"
  })
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-private-rt"
  })
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "public_alb" {
  name        = "${local.name}-public-alb"
  description = "Public customer API load balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "internal_alb" {
  name        = "${local.name}-internal-alb"
  description = "Internal admin load balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "ecs" {
  name        = "${local.name}-ecs"
  description = "ECS service tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3000
    to_port         = 5173
    protocol        = "tcp"
    security_groups = [aws_security_group.public_alb.id, aws_security_group.internal_alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "database" {
  name        = "${local.name}-database"
  description = "PostgreSQL access from ECS"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = local.common_tags
}

resource "aws_security_group" "redis" {
  name        = "${local.name}-redis"
  description = "Redis access from ECS"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = local.common_tags
}

resource "aws_ecr_repository" "service" {
  for_each = local.services

  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "service" {
  for_each = local.services

  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = local.common_tags
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db"
  subnet_ids = aws_subnet.private[*].id

  tags = local.common_tags
}

resource "aws_db_instance" "postgres" {
  identifier              = "${local.name}-postgres"
  engine                  = "postgres"
  engine_version          = "15"
  instance_class          = var.environment == "prod" ? "db.t3.small" : "db.t3.micro"
  allocated_storage       = var.environment == "prod" ? 50 : 20
  db_name                 = var.db_name
  username                = var.db_username
  password                = random_password.db_password.result
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.database.id]
  multi_az                = var.multi_az_database
  publicly_accessible     = false
  skip_final_snapshot     = var.environment != "prod"
  deletion_protection     = var.enable_deletion_protection
  backup_retention_period = var.environment == "prod" ? 7 : 1

  tags = local.common_tags
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name}-redis"
  subnet_ids = aws_subnet.private[*].id

  tags = local.common_tags
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${local.name}-redis"
  engine               = "redis"
  node_type            = var.environment == "prod" ? "cache.t3.small" : "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.name}/postgres/password"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name}/jwt/secret"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

resource "aws_secretsmanager_secret" "admin_registration_secret" {
  name                    = "${local.name}/admin/registration-secret"
  recovery_window_in_days = var.environment == "prod" ? 30 : 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "admin_registration_secret" {
  secret_id     = aws_secretsmanager_secret.admin_registration_secret.id
  secret_string = random_password.admin_registration_secret.result
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_secrets" {
  name = "${local.name}-ecs-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = [
        aws_secretsmanager_secret.db_password.arn,
        aws_secretsmanager_secret.jwt_secret.arn,
        aws_secretsmanager_secret.admin_registration_secret.arn
      ]
    }]
  })
}

resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

resource "aws_lb" "public" {
  name               = "${local.name}-public"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.public_alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.enable_deletion_protection

  tags = local.common_tags
}

resource "aws_lb" "internal" {
  name               = "${local.name}-internal"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.internal_alb.id]
  subnets            = aws_subnet.private[*].id

  enable_deletion_protection = var.enable_deletion_protection

  tags = local.common_tags
}

resource "aws_lb_target_group" "service" {
  for_each = local.services

  name        = "${substr(local.name, 0, 16)}-${each.key}"
  port        = each.value.port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = each.value.health_path
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "public_http" {
  load_balancer_arn = aws_lb.public.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "application/json"
      message_body = "{\"message\":\"ShopCloud API\"}"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "public_service" {
  for_each = local.public_services

  listener_arn = aws_lb_listener.public_http.arn
  priority     = 100 + index(keys(local.public_services), each.key)

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[each.key].arn
  }

  condition {
    path_pattern {
      values = each.value.paths
    }
  }
}

resource "aws_lb_listener" "internal_http" {
  load_balancer_arn = aws_lb.internal.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["admin"].arn
  }
}

resource "aws_ecs_task_definition" "service" {
  for_each = local.services

  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${aws_ecr_repository.service[each.key].repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = each.value.port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "POSTGRES_USER", value = var.db_username },
        { name = "POSTGRES_DB", value = var.db_name },
        { name = "POSTGRES_HOST", value = aws_db_instance.postgres.address },
        { name = "POSTGRES_PORT", value = "5432" },
        { name = "REDIS_HOST", value = aws_elasticache_cluster.redis.cache_nodes[0].address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "AUTH_PORT", value = "3000" },
        { name = "CATALOG_PORT", value = "3001" },
        { name = "CART_PORT", value = "3002" },
        { name = "CHECKOUT_PORT", value = "3003" },
        { name = "ADMIN_PORT", value = "3004" },
        { name = "FRONTEND_PORT", value = "5173" },
        { name = "FRONTEND_ORIGIN", value = "http://${aws_lb.public.dns_name}" },
        { name = "AUTH_API_BASE_URL", value = "http://${aws_lb.public.dns_name}" },
        { name = "CATALOG_API_BASE_URL", value = "http://${aws_lb.public.dns_name}" },
        { name = "CART_API_BASE_URL", value = "http://${aws_lb.public.dns_name}" },
        { name = "CHECKOUT_API_BASE_URL", value = "http://${aws_lb.public.dns_name}" },
        { name = "ADMIN_API_BASE_URL", value = "http://${aws_lb.internal.dns_name}" }
      ]

      secrets = [
        { name = "POSTGRES_PASSWORD", valueFrom = aws_secretsmanager_secret.db_password.arn },
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
        { name = "ADMIN_REGISTRATION_SECRET", valueFrom = aws_secretsmanager_secret.admin_registration_secret.arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = each.key
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "service" {
  for_each = local.services

  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.service[each.key].arn
    container_name   = each.key
    container_port   = each.value.port
  }

  depends_on = [
    aws_lb_listener.public_http,
    aws_lb_listener.internal_http,
    aws_iam_role_policy_attachment.ecs_task_execution
  ]

  tags = local.common_tags
}
