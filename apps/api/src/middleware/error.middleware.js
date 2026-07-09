export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFoundHandler(_req, res) {
  res.status(404).json(errorResponse('NOT_FOUND', 'No API route matches this request.'));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(errorResponse(err.code, err.message));
  }

  if (err?.name === 'ValidationError') {
    return res.status(400).json(errorResponse('VALIDATION_ERROR', err.message));
  }

  if (err?.code === 11000) {
    return res.status(409).json(errorResponse('CONFLICT', 'A record with these unique fields already exists.'));
  }

  console.error(err);
  return res.status(500).json(errorResponse('INTERNAL_ERROR', 'Something went wrong.'));
}

export function errorResponse(code, message) {
  return { error: { code, message } };
}
