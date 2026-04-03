// ═══════════════════════════════════════════════════════
// Error Handling Middleware
// ═══════════════════════════════════════════════════════

// Custom API error class
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

// 404 handler
const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

// Global error handler
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  // Validation errors from express-validator
  if (err.array && typeof err.array === "function") {
    statusCode = 422;
    message = "Validation error";
  }

  // PostgreSQL unique constraint violation
  if (err.code === "23505") {
    statusCode = 409;
    message = "Resource already exists";
  }

  // PostgreSQL foreign key violation
  if (err.code === "23503") {
    statusCode = 400;
    message = "Referenced resource does not exist";
  }

  // Log errors in development
  if (process.env.NODE_ENV !== "production") {
    console.error(`[ERROR] ${statusCode} ${message}`, err.stack);
  }

  res.status(statusCode).json({
    error: message,
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

module.exports = { ApiError, notFound, errorHandler };
