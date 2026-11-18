/**
 * Runtime tuning for high-performance and resource-constrained environments (e.g. cPanel / CloudLinux LVE).
 * This module MUST execute before any asynchronous work or native Rust addons (Prisma / Tokio) are initialized.
 */

// Limit Tokio worker threads to avoid exceeding cPanel nproc / ulimit -u limits
if (!process.env.TOKIO_WORKER_THREADS) {
  process.env.TOKIO_WORKER_THREADS = '2';
}

// Keep libuv threadpool sized appropriately
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '4';
}

