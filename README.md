# ShopCloud

ShopCloud is a lightweight e-commerce backend built as a set of Node.js microservices. The project includes authentication, product catalog, shopping cart, checkout, invoice generation, and admin inventory operations.

## Services

| Service | Port | Purpose |
| --- | ---: | --- |
| Auth | 3000 | Customer/admin registration, login, JWT authentication |
| Catalog | 3001 | Public product listing and product lookup |
| Cart | 3002 | Redis-backed customer shopping cart |
| Checkout | 3003 | Order placement, stock updates, async invoice generation |
| Admin | 3004 | Admin dashboard, inventory updates, return processing |
| PostgreSQL | 5432 | Users, products, orders, invoices, returns |
| Redis | 6379 | Cart persistence |

## Run Locally

Start all services:

```powershell
docker compose up -d --build
```

Check container status:

```powershell
docker compose ps
```

Stop all services:

```powershell
docker compose down
```

## Health Checks

```powershell
curl.exe http://localhost:3000/health
curl.exe http://localhost:3001/health
curl.exe http://localhost:3002/health
curl.exe http://localhost:3003/health
curl.exe http://localhost:3004/health
```

Each service should return a JSON response with `status` set to `ok`.

## Customer Demo Flow

Register a customer:

```powershell
$body = @{
  name = "Theo"
  email = "theo$(Get-Random)@test.com"
  password = "pass123"
} | ConvertTo-Json

$user = Invoke-RestMethod -Method Post -Uri http://localhost:3000/register -ContentType "application/json" -Body $body
$token = $user.token
```

View products:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3001/products
```

Add a product to the cart:

```powershell
$cartBody = @{
  productId = 1
  quantity = 2
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3002/cart/add -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $cartBody
```

View the cart:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3002/cart -Headers @{ Authorization = "Bearer $token" }
```

Checkout:

```powershell
$checkout = Invoke-RestMethod -Method Post -Uri http://localhost:3003/checkout -Headers @{ Authorization = "Bearer $token" }
$checkout
$orderId = $checkout.order.id
```

Check the generated invoice:

```powershell
Start-Sleep -Seconds 2
Invoke-RestMethod -Method Get -Uri "http://localhost:3003/orders/$orderId/invoice" -Headers @{ Authorization = "Bearer $token" }
```

Download the invoice PDF:

```powershell
Invoke-WebRequest -Uri "http://localhost:3003/orders/$orderId/invoice.pdf" -Headers @{ Authorization = "Bearer $token" } -OutFile "invoice-$orderId.pdf"
```

## Admin Demo Flow

Register an admin:

```powershell
$adminBody = @{
  name = "Admin"
  email = "admin$(Get-Random)@test.com"
  password = "admin123"
  role = "admin"
} | ConvertTo-Json

$admin = Invoke-RestMethod -Method Post -Uri http://localhost:3000/register -ContentType "application/json" -Body $adminBody
$adminToken = $admin.token
```

View the admin dashboard:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3004/dashboard -Headers @{ Authorization = "Bearer $adminToken" }
```

List inventory:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3004/products -Headers @{ Authorization = "Bearer $adminToken" }
```

Update stock:

```powershell
$updateBody = @{
  stock = 15
} | ConvertTo-Json

Invoke-RestMethod -Method Patch -Uri http://localhost:3004/products/1 -Headers @{ Authorization = "Bearer $adminToken" } -ContentType "application/json" -Body $updateBody
```

Process a return:

```powershell
$returnBody = @{
  orderId = $orderId
  productId = 1
  quantity = 1
  reason = "Customer return"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3004/returns -Headers @{ Authorization = "Bearer $adminToken" } -ContentType "application/json" -Body $returnBody
```

## Project Documents

- `Project Architecture.pdf`: Phase 1 architecture/design report.
- `Project Spring 2026 (1).pdf`: project requirements document.

