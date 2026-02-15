# SyncScript v2 Setup Guide

## Prerequisites

- Node.js (v16+)
- PostgreSQL (v14+)
- npm or yarn

---

## Step 1: Install PostgreSQL

### Windows
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer
3. Set password for `postgres` user (remember this!)
4. Default port: 5432

### macOS
```bash
brew install postgresql@14
brew services start postgresql@14
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

---

## Step 2: Create Database

Open PostgreSQL command line (psql):

```bash
# Windows: Use "SQL Shell (psql)" from Start Menu
# Mac/Linux: 
psql postgres

# In psql:
CREATE DATABASE syncscript;
\q
```

---

## Step 3: Configure Environment Variables

1. Navigate to `backend/` directory
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and update the `DATABASE_URL`:
   ```
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/syncscript?schema=public"
   ```
   Replace `YOUR_PASSWORD` with your PostgreSQL password.

---

## Step 4: Install Dependencies

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd frontend
npm install
```

---

## Step 5: Run Prisma Migrations

This creates all database tables:

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

You should see output confirming table creation:
- User
- Vault
- VaultMember
- Source
- AuditLog

---

## Step 6: Start the Application

### Terminal 1 - Backend
```bash
cd backend
npm start
```

You should see:
```
🚀 SyncScript API v2.0 running on http://localhost:3000
✅ UPGRADED FEATURES:
   - PostgreSQL database with Prisma ORM
   - JWT authentication
   - Real RBAC enforcement
   - WebSocket support (Socket.IO)
   - Audit logging
```

### Terminal 2 - Frontend
```bash
cd frontend
npm run dev
```

You should see:
```
VITE v4.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

---

## Step 7: Access the Application

Open your browser and navigate to: **http://localhost:5173**

### First Time Setup
1. Click "Register" (or you'll see a registration form)
2. Create an account with email and password
3. You'll be automatically logged in
4. Create your first Knowledge Vault
5. Add research sources

---

## Troubleshooting

### Database Connection Error
**Error:** `Can't reach database server`

**Solution:**
1. Verify PostgreSQL is running:
   ```bash
   # Windows
   services.msc  # Look for "postgresql" service
   
   # Mac
   brew services list
   
   # Linux
   sudo systemctl status postgresql
   ```

2. Check DATABASE_URL in `.env` file
3. Verify password is correct

### Prisma Migration Fails
**Error:** `P1001: Can't reach database server`

**Solution:**
1. Make sure database `syncscript` exists
2. Check PostgreSQL is running on port 5432
3. Verify credentials in DATABASE_URL

### Port Already in Use
**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

### Frontend Can't Connect to Backend
**Error:** `Failed to fetch` or CORS errors

**Solution:**
1. Verify backend is running on port 3000
2. Check browser console for specific error
3. Ensure CORS is enabled in server.js

---

## Database Management

### View Database with Prisma Studio
```bash
cd backend
npx prisma studio
```
Opens a web UI at http://localhost:5555 to browse/edit data.

### Reset Database (WARNING: Deletes all data!)
```bash
cd backend
npx prisma migrate reset
```

### Create New Migration (After schema changes)
```bash
cd backend
npx prisma migrate dev --name your_migration_name
```

---

## Development Workflow

### Making Schema Changes
1. Edit `backend/prisma/schema.prisma`
2. Run migration:
   ```bash
   npx prisma migrate dev --name describe_your_change
   ```
3. Prisma Client is auto-regenerated

### Adding New API Endpoints
1. Edit `backend/server.js`
2. Use `prisma` client for database operations
3. Add authentication middleware if needed
4. Test with Postman or frontend

---

## Testing the Upgrade

### 1. Test Authentication
```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 2. Test Vault Creation (with JWT)
```bash
curl -X POST http://localhost:3000/vaults \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"name":"My Research Vault"}'
```

### 3. Test WebSocket Connection
Open browser console on http://localhost:5173 and check for:
```
Client connected: <socket-id>
```

---

## What's New in v2?

### ✅ Database Persistence
- All data stored in PostgreSQL
- No data loss on server restart
- Proper relational data model

### ✅ User Authentication
- Register and login with email/password
- JWT tokens for secure API access
- Passwords hashed with bcrypt

### ✅ Real RBAC
- OWNER: Full control
- CONTRIBUTOR: Add/edit sources
- VIEWER: Read-only access
- Enforced at API level

### ✅ Real-Time Updates
- WebSocket connections (Socket.IO)
- Instant updates across all connected clients
- Polling kept as fallback

### ✅ Audit Logging
- All critical actions logged
- Immutable audit trail
- Accessible to vault OWNER

---

## Next Steps

After getting v2 running:
1. Explore the audit log feature (OWNER only)
2. Test role-based permissions
3. Try real-time collaboration (open two browser tabs)
4. Review the updated README for architecture details

---

## Need Help?

- Check backend logs for errors
- Use Prisma Studio to inspect database
- Review `backend/server.js` for API documentation
- Check browser console for frontend errors

Happy collaborating! 🚀
