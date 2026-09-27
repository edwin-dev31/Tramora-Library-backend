import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiResponse } from '../api-response.js';

interface HttpErrorBody {
  message?: string | string[];
  code?: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const errorBody: HttpErrorBody =
      typeof body === 'string' ? { message: body } : (body ?? {});
    const details = Array.isArray(errorBody.message)
      ? errorBody.message
      : undefined;
    const message = details
      ? 'Request validation failed.'
      : (errorBody.message as string | undefined);
    const result: ApiResponse<never> = {
      data: null,
      error: {
        code:
          errorBody.code ??
          (status === HttpStatus.BAD_REQUEST
            ? 'VALIDATION_ERROR'
            : `HTTP_${status}`),
        ...(details ? { details } : {}),
      },
      message: message ?? 'An unexpected error occurred.',
    };
    response.status(status).json(result);
  }
}
