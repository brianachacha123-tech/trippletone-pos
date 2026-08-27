# 🍺 Trippletone Bar POS - Point of Sale & Business Management System

## Tech Stack
- **Frontend:** React + Vite + Recharts
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Auth:** JWT (JSON Web Tokens)

## Prerequisites
1. **Node.js** (v16+)
2. **PostgreSQL** installed and running

## Setup Instructions

### 1. Create the Database
Open PostgreSQL (pgAdmin or psql) and run:
```sql
CREATE DATABASE trippletone_pos;
```

### 2. Configure Backend
Edit `backend/.env` with your PostgreSQL credentials:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/trippletone_pos
```

### 3. Start the Backend
```bash
cd backend
npm install
npm start
```
This will:
- Create all database tables
- Create default users (admin/cashier)
- Start the API on port 5000

### 4. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on http://localhost:3000

## Default Login Credentials

| Role     | Username | Password    |
|----------|----------|-------------|
| Manager  | admin    | admin123    |
| Cashier  | cashier  | cashier123  |

## System Features

### Cashier POS
- Fast product search and selection
- Category filtering
- Cart management (add, remove, quantity)
- Multiple payment methods (Cash, M-Pesa, Card, Other)
- Automatic stock deduction
- Sale history

### Manager Back Office
- **Dashboard** - KPIs, charts, alerts
- **Sales** - View all transactions with filters
- **Expenses** - Record and track operating expenses
- **Purchases** - Record stock purchases from suppliers
- **Inventory** - Stock levels, adjustments, low stock alerts
- **Products** - Full product catalog management
- **Suppliers** - Supplier management
- **Keg Management** - Track keg sales separately
- **CLB Management** - Separate CLB fund tracking
- **Cash Management** - Payment method breakdown, available funds
- **Reports** - 10+ report types with CSV export
- **Cashier Performance** - Compare cashier metrics
- **Settings** - Business info, user management, audit logs

## Project Structure
```
trippletone-pos/
├── backend/
│   ├── src/
│   │   ├── config/        # Database, schema, initialization
│   │   ├── middleware/     # Auth, authorization
│   │   ├── routes/        # API routes (auth, sales, products, etc.)
│   │   └── utils/         # Helpers, audit logging
│   ├── .env               # Environment config
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── context/       # Auth context
│   │   ├── pages/
│   │   │   ├── cashier/   # POS interface
│   │   │   └── manager/   # All manager pages
│   │   └── utils/         # API config
│   └── package.json
└── README.md
```

## Business Rules
- Revenue - Cost of Goods = **Gross Profit**
- Gross Profit - Operating Expenses = **Net Profit**
- Expenses do NOT reduce gross profit
- Purchases affect inventory and cash, not operating expenses
- Cashier cannot access manager functions
- All data persisted in PostgreSQL
