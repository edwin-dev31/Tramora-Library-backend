import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { z } from 'zod';
import { AuthService } from './auth.service.js';

export function jwtSecret(config: ConfigService): string {
  const secret = config.getOrThrow<string>('JWT_SECRET');
  if (secret.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret(config),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  validate(payload: unknown) {
    const parsed = z
      .object({ sub: z.uuid(), exp: z.number() })
      .safeParse(payload);
    if (!parsed.success) throw new UnauthorizedException();
    return this.auth.findUser(parsed.data.sub);
  }
}
