import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { Profile } from '../../database/schemas/profile.schema';
import { UserRole } from '../../database/schemas/user-role.schema';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRole>,
  ) {
    const jwtSecret = configService.get<string>('jwt.secret');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }
    
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => {
          // Fallback: read token from query parameter (for file downloads)
          return request?.query?.token as string || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    // Verify user still exists and is active
    const user = await this.profileModel.findById(payload.sub).exec();
    
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Get fresh roles
    const userRoles = await this.userRoleModel.find({ userId: user._id }).exec();
    const roles = userRoles.map((ur) => ur.role);

    return {
      userId: payload.sub,
      email: payload.email,
      roles,
    };
  }
}
