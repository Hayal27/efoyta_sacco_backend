import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from './env';

let io: SocketIOServer | null = null;

/**
 * Initialize the Socket.IO server, bound to the given HTTP server.
 * Call once from server.ts after creating the HTTP server.
 */
export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*') || env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        return callback(new Error('CORS rejected'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    // Client joins their personal room (supports both userId and memberId)
    socket.on('join', (id: string) => {
      if (id) {
        socket.join(`user:${id}`);
        socket.join(`member:${id}`);
      }
    });

    socket.on('disconnect', () => {
      // cleanup is automatic — no manual leave needed
    });
  });

  console.info('🔌 Socket.IO server initialized');
  return io;
}

/**
 * Returns the shared Socket.IO instance.
 * Throws if initSocketIO() has not been called yet.
 */
export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized — call initSocketIO() first');
  return io;
}

/**
 * Emit a real-time event to one specific user room.
 */
export function emitToUser(userId: string, event: string, payload: unknown) {
  try {
    getIO().to(`user:${userId}`).emit(event, payload);
  } catch {
    // Socket.IO not yet up (e.g. during tests) — silently skip
  }
}

/**
 * Emit a real-time event to all connected clients in a named room.
 */
export function emitToRoom(room: string, event: string, payload: unknown) {
  try {
    getIO().to(room).emit(event, payload);
  } catch {
    // silently skip if not initialized
  }
}
