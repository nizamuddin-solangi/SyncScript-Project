/**
 * SyncScript Backend Server
 * 
 * This is a hackathon MVP demonstrating system design concepts.
 * In-memory storage is used for simplicity - in production, this would be replaced
 * with a proper database (PostgreSQL) and additional infrastructure.
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors()); // Enable CORS for frontend communication
app.use(express.json()); // Parse JSON request bodies

// ============================================================================
// IN-MEMORY DATA STORAGE
// ============================================================================
// NOTE: In production, this would be replaced with PostgreSQL
// - Vaults table with columns: id, name, owner_id, created_at
// - Sources table with columns: id, vault_id, title, url, added_by, added_at
// - VaultMembers table for RBAC: vault_id, user_id, role (OWNER/CONTRIBUTOR/VIEWER)
// ============================================================================

let vaults = [];
let sources = [];
let vaultIdCounter = 1;
let sourceIdCounter = 1;

// ============================================================================
// DATA MODELS (Simulated)
// ============================================================================

/**
 * Vault Model
 * @typedef {Object} Vault
 * @property {number} id - Unique identifier
 * @property {string} name - Vault name
 * @property {string} role - User's role in this vault (OWNER/CONTRIBUTOR/VIEWER)
 * @property {string} createdAt - ISO timestamp
 * 
 * PRODUCTION NOTE: Role would come from VaultMembers join table based on authenticated user
 */

/**
 * Source Model
 * @typedef {Object} Source
 * @property {number} id - Unique identifier
 * @property {number} vaultId - Reference to parent vault
 * @property {string} title - Source title
 * @property {string} url - Source URL
 * @property {string} addedAt - ISO timestamp
 * 
 * PRODUCTION NOTE: Would include addedBy (user_id) and potentially file_url for PDF uploads
 * PDF uploads would be stored in AWS S3 or Cloudinary, with URLs stored in the database
 */

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Health Check Endpoint
 * GET /
 */
app.get('/', (req, res) => {
  res.json({ 
    message: 'SyncScript API is running',
    version: '1.0.0',
    endpoints: {
      vaults: '/vaults',
      sources: '/vaults/:id/sources'
    }
  });
});

/**
 * Get All Vaults
 * GET /vaults
 * 
 * PRODUCTION NOTES:
 * - Would require JWT authentication middleware
 * - Would query VaultMembers table to get only vaults the authenticated user has access to
 * - Would include pagination (limit/offset or cursor-based)
 * - Would use Redis caching for frequently accessed vault lists
 */
app.get('/vaults', (req, res) => {
  // In production: const userId = req.user.id; // from JWT middleware
  // In production: SELECT v.*, vm.role FROM vaults v JOIN vault_members vm ON v.id = vm.vault_id WHERE vm.user_id = $1
  
  res.json({
    success: true,
    data: vaults
  });
});

/**
 * Create New Vault
 * POST /vaults
 * Body: { name: string }
 * 
 * PRODUCTION NOTES:
 * - Would require JWT authentication
 * - Would use database transaction to create vault AND add creator as OWNER in VaultMembers
 * - Would validate vault name (length, uniqueness per user, etc.)
 * - Would emit WebSocket event to notify collaborators in real-time
 */
app.post('/vaults', (req, res) => {
  const { name } = req.body;
  
  // Validation
  if (!name || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Vault name is required'
    });
  }
  
  // Create vault with default OWNER role
  // In production: const userId = req.user.id;
  const newVault = {
    id: vaultIdCounter++,
    name: name.trim(),
    role: 'OWNER', // Simulated - in production, this comes from VaultMembers table
    createdAt: new Date().toISOString()
  };
  
  vaults.push(newVault);
  
  // In production: 
  // 1. INSERT INTO vaults (name, owner_id) VALUES ($1, $2) RETURNING *
  // 2. INSERT INTO vault_members (vault_id, user_id, role) VALUES ($1, $2, 'OWNER')
  // 3. Emit WebSocket event: { type: 'VAULT_CREATED', vaultId, name }
  
  res.status(201).json({
    success: true,
    data: newVault
  });
});

/**
 * Get All Sources for a Vault
 * GET /vaults/:id/sources
 * 
 * PRODUCTION NOTES:
 * - Would require JWT authentication
 * - Would verify user has access to this vault (check VaultMembers)
 * - Would include pagination
 * - Would use Redis caching for frequently accessed sources
 * - Would include metadata like addedBy user info (JOIN with users table)
 */
app.get('/vaults/:id/sources', (req, res) => {
  const vaultId = parseInt(req.params.id);
  
  // Verify vault exists
  const vault = vaults.find(v => v.id === vaultId);
  if (!vault) {
    return res.status(404).json({
      success: false,
      error: 'Vault not found'
    });
  }
  
  // In production: Verify user has access to this vault
  // SELECT role FROM vault_members WHERE vault_id = $1 AND user_id = $2
  // If no row returned, user doesn't have access (403 Forbidden)
  
  // Get all sources for this vault
  const vaultSources = sources.filter(s => s.vaultId === vaultId);
  
  res.json({
    success: true,
    data: vaultSources
  });
});

/**
 * Add Source to Vault
 * POST /vaults/:id/sources
 * Body: { title: string, url: string }
 * 
 * PRODUCTION NOTES:
 * - Would require JWT authentication
 * - Would verify user has OWNER or CONTRIBUTOR role (not just VIEWER)
 * - Would validate URL format
 * - Would support PDF file uploads to AWS S3/Cloudinary
 * - Would emit WebSocket event for real-time collaboration
 * - Would create activity log entry for audit trail
 */
app.post('/vaults/:id/sources', (req, res) => {
  const vaultId = parseInt(req.params.id);
  const { title, url } = req.body;
  
  // Verify vault exists
  const vault = vaults.find(v => v.id === vaultId);
  if (!vault) {
    return res.status(404).json({
      success: false,
      error: 'Vault not found'
    });
  }
  
  // Validation
  if (!title || title.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Source title is required'
    });
  }
  
  if (!url || url.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Source URL is required'
    });
  }
  
  // In production: Check user's role
  // SELECT role FROM vault_members WHERE vault_id = $1 AND user_id = $2
  // If role is 'VIEWER', return 403 Forbidden
  
  // Create source
  const newSource = {
    id: sourceIdCounter++,
    vaultId: vaultId,
    title: title.trim(),
    url: url.trim(),
    addedAt: new Date().toISOString()
    // In production: addedBy: req.user.id
  };
  
  sources.push(newSource);
  
  // In production:
  // 1. INSERT INTO sources (vault_id, title, url, added_by) VALUES ($1, $2, $3, $4) RETURNING *
  // 2. For PDF uploads: Upload to S3, store S3 URL in file_url column
  // 3. INSERT INTO activity_log (vault_id, user_id, action, resource_id) VALUES (...)
  // 4. Emit WebSocket event: { type: 'SOURCE_ADDED', vaultId, source: newSource }
  
  res.status(201).json({
    success: true,
    data: newSource
  });
});

// ============================================================================
// PRODUCTION INFRASTRUCTURE NOTES
// ============================================================================

/**
 * AUTHENTICATION & AUTHORIZATION:
 * - JWT-based authentication middleware
 * - Tokens stored in httpOnly cookies or Authorization header
 * - Middleware to extract user from JWT: req.user = { id, email, name }
 * 
 * ROLE-BASED ACCESS CONTROL (RBAC):
 * - VaultMembers table: (vault_id, user_id, role, joined_at)
 * - Roles: OWNER (full control), CONTRIBUTOR (add/edit), VIEWER (read-only)
 * - Middleware to check permissions before allowing operations
 * 
 * REAL-TIME COLLABORATION:
 * - WebSocket server (Socket.io or native WebSockets)
 * - Clients subscribe to vault-specific channels
 * - Events: VAULT_CREATED, SOURCE_ADDED, SOURCE_UPDATED, SOURCE_DELETED
 * - Replaces polling with push-based updates
 * 
 * CACHING STRATEGY:
 * - Redis for frequently accessed data (vault lists, source lists)
 * - Cache invalidation on write operations
 * - TTL-based expiration for stale data prevention
 * 
 * FILE STORAGE:
 * - AWS S3 or Cloudinary for PDF uploads
 * - Signed URLs for secure access
 * - Thumbnail generation for preview
 * 
 * DATABASE:
 * - PostgreSQL with proper indexing
 * - Indexes on: vault_id, user_id, created_at
 * - Connection pooling for performance
 * 
 * SCALABILITY:
 * - Horizontal scaling with load balancer
 * - Stateless server design (session in Redis/JWT)
 * - Database read replicas for read-heavy workloads
 * - CDN for static assets
 */

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`🚀 SyncScript API running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/`);
  console.log(`\n⚠️  NOTE: Using in-memory storage - data will be lost on restart`);
  console.log(`   In production, this would use PostgreSQL with proper persistence\n`);
});
