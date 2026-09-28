import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository.js';
import type { AuthUser, LoginDto, RegisterDto } from './auth.schemas.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.toLowerCase();
    const allowedDomains = this.config
      .get<string>('ALLOWED_EMAIL_DOMAINS', 'gmail.com,jala.edu')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);
    if (!allowedDomains.includes(email.split('@')[1])) {
      throw new BadRequestException('Email domain is not allowed.');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    let userId: string;
    try {
      const user = await this.users.createAccount(input.name, email, passwordHash);
      userId = user.id;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException('Email is already registered.');
      }
      throw error;
    }
    return this.createSession(userId);
  }

  async login(input: LoginDto) {
    const row = await this.users.findCredentials(input.email.toLowerCase());
    if (!row || !(await bcrypt.compare(input.password, row.password_hash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return this.createSession(row.id);
  }

  async findUser(id: string): Promise<AuthUser> {
    const user = await this.users.findPublicById(id);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async createSession(userId: string) {
    return {
      accessToken: await this.jwt.signAsync({ sub: userId }),
      expiresIn: 86400,
    };
  }
}
