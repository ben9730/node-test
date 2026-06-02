import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        status: err.status,
        ...(err.details && { details: err.details }),
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred',
      status: 500,
    },
  });
}
