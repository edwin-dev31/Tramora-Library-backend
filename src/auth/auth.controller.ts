import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import type { AuthUser, LoginDto, RegisterDto } from './auth.schemas.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  register(@Body({ schema: registerSchema }) input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body({ schema: loginSchema }) input: LoginDto) {
    return this.auth.login(input);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  refresh(@CurrentUser() user: AuthUser) {
    return this.auth.createSession(user.id);
  }
}
