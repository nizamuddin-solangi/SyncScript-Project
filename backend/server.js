/**
 * SyncScript Backend Server v2.0
 * 
 * UPGRADE FROM MVP → v1:
 * - PostgreSQL database (Prisma ORM) replaces in-memory storage
 * - JWT authentication with user registration/login
 * - Real RBAC enforcement via database
 * - WebSocket support for real-time collaboration
 * - File upload capability (Local storage)
 * - Audit logging for accountability
 * 
 * All existing APIs remain backward compatible.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const Redis = require('redis');

// ============================================================================
// OPTIMIZATION: Redis Configuration
// ============================================================================
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      if (retries > 3) return new Error('Redis connection failed');
      return Math.min(retries * 100, 1000);
    }
  }
});

// Only log once to avoid console noise, then suppress
redisClient.on('error', (err) => {
  if (err.code === 'ECONNREFUSED') {
    // Only log the first time or if state changes
    if (!redisClient.silentErrorLogged) {
      console.log('📡 Redis is offline (Caching disabled)');
      redisClient.silentErrorLogged = true;
    }
  } else {
    console.log('Redis Client Error', err);
  }
});

// Connect to Redis (Async)
(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.error('Redis connection failed (Continuing without cache):', err.message);
  }
})();

// ============================================================================
// SECURITY: Rate Limiting
// ============================================================================

// General rate limiter: 100 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for Auth: 5 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Slightly more lenient for dev
  message: { success: false, error: 'Too many login/register attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});

// File filter for allowed types
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/jpg'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  }
};

// Multer upload instance
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(generalLimiter);
app.use(cors());
app.use(express.json());
// Serve uploaded files statically (DEV ONLY - Use S3/CDN in production)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to req.user
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
    req.user = user; // { id, email, name }
    next();
  });
};

/**
 * Optional Authentication Middleware
 * Attaches user if token exists, but doesn't require it
 * Used for backward compatibility with MVP
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }
  next();
};

/**
 * RBAC Middleware
 * Checks if user has required role in vault
 */
const requireVaultRole = (allowedRoles) => {
  return async (req, res, next) => {
    const vaultId = parseInt(req.params.id);
    const userId = req.user.id;

    try {
      const membership = await prisma.vaultMember.findFirst({
        where: {
          vaultId: vaultId,
          userId: userId
        }
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this vault'
        });
      }

      if (!allowedRoles.includes(membership.role)) {
        return res.status(403).json({
          success: false,
          error: `This action requires one of these roles: ${allowedRoles.join(', ')}`
        });
      }

      req.userRole = membership.role;
      next();
    } catch (error) {
      console.error('RBAC check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify permissions'
      });
    }
  };
};

/**
 * Audit Log Helper
 * Creates audit log entry for critical actions
 */
const logAction = async (vaultId, userId, action, resourceType = null, resourceId = null, metadata = null) => {
  try {
    await prisma.auditLog.create({
      data: {
        vaultId,
        userId,
        action,
        resourceType,
        resourceId,
        metadata: metadata ? JSON.stringify(metadata) : null
      }
    });
  } catch (error) {
    console.error('Audit log error:', error);
    // Don't fail the request if audit logging fails
  }
};

// ============================================================================
// AUTHENTICATION ENDPOINTS (Phase 2)
// ============================================================================

/**
 * User Registration
 * POST /auth/register
 * Body: { email, password, name }
 */
app.post('/auth/register', authLimiter, async (req, res) => {
  const { email, password, name } = req.body;

  // Validation
  if (!email || !password || !name) {
    return res.status(400).json({
      success: false,
      error: 'Email, password, and name are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters'
    });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register user'
    });
  }
});

/**
 * User Login
 * POST /auth/login
 * Body: { email, password }
 */
app.post('/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login'
    });
  }
});

// ============================================================================
// VAULT ENDPOINTS (Phase 1 - Migrated to Prisma)
// ============================================================================

/**
 * Health Check Endpoint
 * GET /
 */
app.get('/', (req, res) => {
  res.json({
    message: 'SyncScript API v2.0 is running',
    version: '2.0.0',
    features: ['PostgreSQL', 'JWT Auth', 'RBAC', 'WebSockets', 'Audit Logs'],
    endpoints: {
      auth: '/auth/register, /auth/login',
      vaults: '/vaults',
      sources: '/vaults/:id/sources'
    }
  });
});

/**
 * Get All Vaults for Authenticated User
 * GET /vaults
 * 
 * UPGRADED: Now uses PostgreSQL and returns only vaults user has access to
 */
app.get('/vaults', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const cacheKey = `vaults:user:${userId}`;

  try {
    // Try to get from cache
    if (redisClient.isReady) {
      try {
        const cachedVaults = await redisClient.get(cacheKey);
        if (cachedVaults) {
          return res.json({ success: true, data: JSON.parse(cachedVaults), _cached: true });
        }
      } catch (cacheError) {
        console.error('Redis GET error (Vaults):', cacheError);
      }
    }

    // Get all vaults where user is a member
    const vaultMemberships = await prisma.vaultMember.findMany({
      where: { userId: userId },
      include: { vault: true }
    });

    // Transform to include role
    const vaults = vaultMemberships.map(membership => ({
      id: membership.vault.id,
      name: membership.vault.name,
      role: membership.role,
      createdAt: membership.vault.createdAt.toISOString()
    }));

    // Cache the result
    if (redisClient.isReady) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(vaults), { EX: 300 }); // 5 min cache
      } catch (cacheError) {
        console.error('Redis SET error (Vaults):', cacheError);
      }
    }

    res.json({ success: true, data: vaults });
  } catch (error) {
    console.error('Get vaults error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch vaults' });
  }
});

/**
 * Create New Vault
 * POST /vaults
 * Body: { name: string }
 * 
 * UPGRADED: Now creates vault in PostgreSQL and adds creator as OWNER
 */
app.post('/vaults', authenticateToken, async (req, res) => {
  const { name } = req.body;
  const userId = req.user.id;

  // Validation
  if (!name || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Vault name is required'
    });
  }

  try {
    // Create vault and add creator as OWNER in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create vault
      const vault = await tx.vault.create({
        data: {
          name: name.trim(),
          ownerId: userId
        }
      });

      // Add creator as OWNER in vault_members
      await tx.vaultMember.create({
        data: {
          vaultId: vault.id,
          userId: userId,
          role: 'OWNER'
        }
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          vaultId: vault.id,
          userId: userId,
          action: 'VAULT_CREATED',
          resourceType: 'vault',
          resourceId: vault.id
        }
      });

      return vault;
    });

    // Invalidate user's vault cache
    if (redisClient.isReady) {
      try {
        await redisClient.del(`vaults:user:${userId}`);
      } catch (cacheError) {
        console.error('Redis DEL error (Vaults):', cacheError);
      }
    }

    // Emit WebSocket event (Phase 4)
    io.to(`user_${userId}`).emit('vault:created', {
      id: result.id,
      name: result.name,
      role: 'OWNER',
      createdAt: result.createdAt.toISOString()
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        name: result.name,
        role: 'OWNER',
        createdAt: result.createdAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Create vault error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create vault'
    });
  }
});

// ============================================================================
// SOURCE ENDPOINTS (Phase 1 - Migrated to Prisma)
// ============================================================================

/**
 * Get All Sources for a Vault
 * GET /vaults/:id/sources
 * 
 * UPGRADED: Now uses PostgreSQL and verifies user has access
 */
app.get('/vaults/:id/sources', authenticateToken, requireVaultRole(['OWNER', 'CONTRIBUTOR', 'VIEWER']), async (req, res) => {
  const vaultId = parseInt(req.params.id);
  const cacheKey = `vault:${vaultId}:sources`;

  try {
    // Try to get from cache
    if (redisClient.isReady) {
      try {
        const cachedSources = await redisClient.get(cacheKey);
        if (cachedSources) {
          return res.json({ success: true, data: JSON.parse(cachedSources), _cached: true });
        }
      } catch (cacheError) {
        console.error('Redis GET error (Sources):', cacheError);
      }
    }

    const sources = await prisma.source.findMany({
      where: {
        vaultId: vaultId
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        addedAt: 'desc'
      }
    });

    // Transform to match frontend expectations
    const formattedSources = sources.map(source => ({
      id: source.id,
      vaultId: source.vaultId,
      type: source.type,
      title: source.title,
      content: source.content || source.url, // Fallback to url for legacy records
      mimeType: source.mimeType,
      size: source.size,
      addedBy: source.creator.name,
      addedAt: source.addedAt.toISOString(),
      // Legacy fields for backward compatibility
      url: source.url
    }));

    // Cache the result
    if (redisClient.isReady) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(formattedSources), { EX: 60 }); // 1 min cache for researchers
      } catch (cacheError) {
        console.error('Redis SET error (Sources):', cacheError);
      }
    }

    res.json({
      success: true,
      data: formattedSources
    });
  } catch (error) {
    console.error('Get sources error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sources'
    });
  }
});

/**
 * Add Member to Vault
 * POST /vaults/:id/members
 * Body: { email, role }
 * 
 * Only accessible by OWNER
 */
app.post('/vaults/:id/members', authenticateToken, requireVaultRole(['OWNER']), async (req, res) => {
  const vaultId = parseInt(req.params.id);
  const { email, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ success: false, error: 'Email and role are required' });
  }

  const allowedRoles = ['CONTRIBUTOR', 'VIEWER'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role. Use CONTRIBUTOR or VIEWER' });
  }

  try {
    // Find user by email
    const userToAdd = await prisma.user.findUnique({
      where: { email }
    });

    if (!userToAdd) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if user is already a member
    const existingMembership = await prisma.vaultMember.findFirst({
      where: { vaultId, userId: userToAdd.id }
    });

    if (existingMembership) {
      return res.status(409).json({ success: false, error: 'User is already a member of this vault' });
    }

    // Add member in transaction
    const vault = await prisma.vault.findUnique({ where: { id: vaultId } });

    await prisma.$transaction(async (tx) => {
      await tx.vaultMember.create({
        data: {
          vaultId,
          userId: userToAdd.id,
          role
        }
      });

      await tx.auditLog.create({
        data: {
          vaultId,
          userId: req.user.id,
          action: 'MEMBER_ADDED',
          resourceType: 'user',
          resourceId: userToAdd.id,
          metadata: JSON.stringify({ email, role })
        }
      });
    });

    // Invalidate user's vault cache
    if (redisClient.isReady) {
      try {
        await redisClient.del(`vaults:user:${userToAdd.id}`);
      } catch (cacheError) {
        console.error('Redis DEL error (Add Member):', cacheError);
      }
    }

    // MISSION: Automated Notifications
    // Emit real-time notification via Socket.IO
    if (userToAdd.id && vault) {
      io.to(`user_${userToAdd.id}`).emit('notification', {
        type: 'COLLABORATION',
        message: `You have been added to the vault "${vault.name}" as a ${role}.`,
        vaultId,
        vaultName: vault.name
      });
    }

    res.status(201).json({
      success: true,
      message: `User ${email} added as ${role}`
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ success: false, error: 'Failed to add member' });
  }
});

/**
 * Download Source File
 * GET /sources/:id/download
 */
app.get('/sources/:id/download', authenticateToken, async (req, res) => {
  const sourceId = parseInt(req.params.id);

  try {
    // Get source and verify access
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      include: { vault: true }
    });

    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    // Verify user has access to vault
    const membership = await prisma.vaultMember.findFirst({
      where: {
        vaultId: source.vaultId,
        userId: req.user.id
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if source is a file
    if (source.type !== 'file' && source.type !== 'image') {
      return res.status(400).json({ error: 'Source is not a file' });
    }

    // Serve file
    if (source.content.startsWith('http')) {
      // Cloudinary/External URL - redirect to it
      return res.redirect(source.content);
    }

    // Local file - content stores relative path like "/uploads/filename.ext"
    const relativePath = source.content.startsWith('/') ? source.content.substring(1) : source.content;
    const filePath = path.join(__dirname, relativePath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.download(filePath, source.title); // Download with original title
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

/**
 * Add Source to Vault
 * POST /vaults/:id/sources
 * Body: { title: string, url: string }
 * 
 * UPGRADED: Now uses PostgreSQL and enforces RBAC (OWNER/CONTRIBUTOR only)
 */
app.post('/vaults/:id/sources',
  authenticateToken,
  requireVaultRole(['OWNER', 'CONTRIBUTOR']),
  upload.single('file'), // Handle file upload
  async (req, res) => {
    const vaultId = parseInt(req.params.id);
    // When using multer, text fields are in req.body, file is in req.file
    const { title, url, type, content } = req.body;
    const userId = req.user.id;

    // Validation
    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Source title is required'
      });
    }

    // Determine source type and content
    let sourceType = type || 'url'; // Default to URL for backward compatibility
    let sourceContent = '';
    let sourceMimeType = null;
    let sourceSize = null;

    // Handle different types
    if (sourceType === 'file' || sourceType === 'image') {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'File is required' });
      }

      // Simplify: Local Storage only
      console.log('📦 Saving file to local storage.');
      const filename = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
      const filePath = path.join(uploadsDir, filename);

      try {
        fs.writeFileSync(filePath, req.file.buffer);
        sourceContent = `/uploads/${filename}`;
        sourceMimeType = req.file.mimetype;
        sourceSize = req.file.size;
      } catch (localError) {
        console.error('Local save error:', localError);
        return res.status(500).json({ success: false, error: 'Failed to save file locally' });
      }
    } else if (sourceType === 'url' || sourceType === 'media') {
      // For legacy clients sending only 'url'
      sourceContent = content || url;
      if (!sourceContent) {
        return res.status(400).json({ success: false, error: 'URL is required' });
      }
    } else if (sourceType === 'note') {
      sourceContent = content;
      if (!sourceContent) {
        return res.status(400).json({ success: false, error: 'Note content is required' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'Invalid source type' });
    }

    try {
      // Create source and audit log in transaction
      const source = await prisma.$transaction(async (tx) => {
        const newSource = await tx.source.create({
          data: {
            vaultId: vaultId,
            type: sourceType,
            title: title.trim(),
            content: sourceContent,
            mimeType: sourceMimeType,
            size: sourceSize,
            // Maintained for backward compatibility
            url: (sourceType === 'url' || sourceType === 'media') ? sourceContent : null,
            addedBy: userId
          },
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            vaultId: vaultId,
            userId: userId,
            action: 'SOURCE_ADDED',
            resourceType: 'source',
            resourceId: newSource.id,
            metadata: JSON.stringify({
              title: newSource.title,
              type: newSource.type
            })
          }
        });

        return newSource;
      });

      // Invalidate vault sources cache
      if (redisClient.isReady) {
        try {
          await redisClient.del(`vault:${vaultId}:sources`);
        } catch (cacheError) {
          console.error('Redis DEL error (Add Source):', cacheError);
        }
      }

      // Emit WebSocket event to all vault members
      io.to(`vault_${vaultId}`).emit('source:added', {
        id: source.id,
        vaultId: source.vaultId,
        type: source.type,
        title: source.title,
        content: source.content,
        mimeType: source.mimeType,
        size: source.size,
        addedBy: source.creator.name,
        addedAt: source.addedAt.toISOString(),
        url: source.url // Legacy compat
      });

      res.status(201).json({
        success: true,
        data: {
          id: source.id,
          vaultId: source.vaultId,
          type: source.type,
          title: source.title,
          content: source.content,
          mimeType: source.mimeType,
          size: source.size,
          addedBy: source.creator.name,
          addedAt: source.addedAt.toISOString(),
          url: source.url
        }
      });
    } catch (error) {
      console.error('Add source error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add source: ' + error.message
      });
    }
  }
);

// ============================================================================
// AUDIT LOG ENDPOINTS (Phase 6)
// ============================================================================

/**
 * Get Audit Logs for a Vault
 * GET /vaults/:id/audit
 * 
 * Only accessible by OWNER
 */
app.get('/vaults/:id/audit', authenticateToken, requireVaultRole(['OWNER']), async (req, res) => {
  const vaultId = parseInt(req.params.id);

  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        vaultId: vaultId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limit to last 100 entries
    });

    const formattedLogs = logs.map(log => ({
      id: log.id,
      action: log.action,
      user: log.user.name,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
      createdAt: log.createdAt.toISOString()
    }));

    res.json({
      success: true,
      data: formattedLogs
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit logs'
    });
  }
});

// ============================================================================
// WEBSOCKET SETUP (Phase 4)
// ============================================================================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join user's personal room
  socket.on('join:user', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined personal room`);
  });

  // Join vault room
  socket.on('join:vault', (vaultId) => {
    socket.join(`vault_${vaultId}`);
    console.log(`Socket ${socket.id} joined vault ${vaultId}`);
  });

  // Leave vault room
  socket.on('leave:vault', (vaultId) => {
    socket.leave(`vault_${vaultId}`);
    console.log(`Socket ${socket.id} left vault ${vaultId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================

// Ensure all errors return JSON instead of HTML
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'An unexpected error occurred'
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 SyncScript API v2.0 running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/`);
  console.log(`\n✅ UPGRADED FEATURES:`);
  console.log(`   - PostgreSQL database with Prisma ORM`);
  console.log(`   - JWT authentication`);
  console.log(`   - Real RBAC enforcement`);
  console.log(`   - WebSocket support (Socket.IO)`);
  console.log(`   - Audit logging\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
