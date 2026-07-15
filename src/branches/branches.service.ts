import { Injectable, NotFoundException, ConflictException, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { randomBytes } from 'crypto';
import { Branch, BranchDocument } from './branch.schema';
import { CreateBranchDto, UpdateBranchDto, BatchCreateUsersDto, ProvisionCafBranchDto } from './dto/branch.dto';
import { UsersService } from '../users/users.service';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    private readonly usersService: UsersService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private maskSecret(value?: string): string {
    if (!value) return '';
    if (value.length <= 4) return '••••';
    return `••••${value.slice(-4)}`;
  }

  private sanitize(branch: any) {
    const plain = typeof branch.toObject === 'function' ? branch.toObject() : { ...branch };
    return {
      ...plain,
      cafPassword: this.maskSecret(plain.cafPassword),
      labApiKey: this.maskSecret(plain.labApiKey),
      hasCafPassword: !!plain.cafPassword,
      hasLabApiKey: !!plain.labApiKey,
    };
  }

  private cleanSecretUpdates<T extends CreateBranchDto | UpdateBranchDto>(dto: T): T {
    const clean: any = { ...dto };
    for (const key of ['cafPassword', 'labApiKey']) {
      if (clean[key] === '' || (typeof clean[key] === 'string' && clean[key].startsWith('••••'))) {
        delete clean[key];
      }
    }
    return clean;
  }

  async create(dto: CreateBranchDto): Promise<any> {
    const existing = await this.branchModel.findOne({ code: dto.code });
    if (existing) {
      throw new ConflictException(`Branch with code "${dto.code}" already exists`);
    }
    const { provisionCaf, ...branchDto } = dto;
    const created = await this.branchModel.create(this.cleanSecretUpdates(branchDto));
    if (provisionCaf) {
      return this.provisionCafBranch(created._id.toString(), {});
    }
    return this.sanitize(created);
  }

  async findAll(): Promise<any[]> {
    const branches = await this.branchModel.find({ isActive: true }).sort({ name: 1 }).exec();
    return branches.map((branch) => this.sanitize(branch));
  }

  async findByIdRaw(id: string): Promise<BranchDocument> {
    const branch = await this.branchModel.findById(id).exec();
    if (!branch) throw new NotFoundException(`Branch ${id} not found`);
    return branch;
  }

  async findById(id: string): Promise<any> {
    return this.sanitize(await this.findByIdRaw(id));
  }

  async update(id: string, dto: UpdateBranchDto): Promise<any> {
    const branch = await this.findByIdRaw(id);
    Object.assign(branch, this.cleanSecretUpdates(dto));
    return this.sanitize(await branch.save());
  }

  async getBranchConfig(branchId: string): Promise<{
    cafEnabled: boolean;
    cafBaseUrl: string;
    cafUsername: string;
    cafPassword: string;
    hasCafPassword: boolean;
    cafBranchId: string;
    cafTerminalId: string;
    lisEnabled: boolean;
    lisBaseUrl: string;
    labApiKey: string;
    hasLabApiKey: boolean;
    labFacilityId: string;
  }> {
    const branch = await this.findByIdRaw(branchId);
    return {
      cafEnabled: branch.cafEnabled || false,
      cafBaseUrl: branch.cafBaseUrl || this.configService.get<string>('caf.baseUrl') || '',
      cafUsername: branch.cafUsername || this.configService.get<string>('caf.username') || '',
      cafPassword: this.maskSecret(branch.cafPassword),
      hasCafPassword: !!branch.cafPassword,
      cafBranchId: branch.cafBranchId || '',
      cafTerminalId: branch.cafTerminalId || 'emr-integration',
      lisEnabled: branch.lisEnabled || false,
      lisBaseUrl: branch.lisBaseUrl || this.configService.get<string>('lis.baseUrl') || '',
      labApiKey: this.maskSecret(branch.labApiKey),
      hasLabApiKey: !!branch.labApiKey,
      labFacilityId: branch.labFacilityId || '',
    };
  }

  async testCafConfig(branchId: string): Promise<{ ok: boolean; message: string }> {
    const branch = await this.findByIdRaw(branchId);
    const baseUrl = (branch.cafBaseUrl || '').replace(/\/$/, '');
    const username = branch.cafUsername || '';
    const password = branch.cafPassword || '';
    const cafBranchId = branch.cafBranchId || '';

    if (!baseUrl || !username || !password || !cafBranchId) {
      throw new BadRequestException('CAF base URL, username, password, and branch ID are required. Configure these per-branch in Admin > Branches.');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${baseUrl}/auth/login`, { username, password }),
      );
      if (!response.data?.accessToken) {
        return { ok: false, message: 'CAF login response did not include an access token' };
      }
      return { ok: true, message: `CAF authentication succeeded for branch ${cafBranchId}` };
    } catch (error: any) {
      return { ok: false, message: error?.response?.data?.message || error.message || 'CAF connection failed' };
    }
  }

  async testLisConfig(branchId: string): Promise<{ ok: boolean; message: string }> {
    const branch = await this.findByIdRaw(branchId);
    const baseUrl = (branch.lisBaseUrl || this.configService.get<string>('lis.baseUrl') || '').replace(/\/$/, '');
    const apiKey = branch.labApiKey || this.configService.get<string>('lis.apiKey') || '';

    if (!baseUrl || !apiKey) {
      throw new BadRequestException('LIS base URL and API key are required');
    }

    const headers = { 'X-API-Key': apiKey, 'Content-Type': 'application/json' };
    for (const path of ['/external-api/catalog', '/external-api/tests', '/external-api/orderables']) {
      try {
        await firstValueFrom(this.httpService.get(`${baseUrl}${path}`, { headers }));
        return { ok: true, message: `LIS connection succeeded via ${path}` };
      } catch (error: any) {
        this.logger.debug(`LIS test failed for ${path}: ${error?.message}`);
      }
    }

    return { ok: false, message: 'LIS connection failed on all known catalog endpoints' };
  }

  private async authenticateCaf(baseUrl: string, username: string, password: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(`${baseUrl}/auth/login`, { username, password }),
    );
    const token = response.data?.accessToken;
    if (!token) throw new BadRequestException('CAF login did not return an access token');
    return token;
  }

  private pickCafId(payload: any): string {
    return (
      payload?._id ||
      payload?.id ||
      payload?.data?._id ||
      payload?.data?.id ||
      payload?.branch?._id ||
      payload?.branch?.id ||
      ''
    ).toString();
  }

  async provisionCafBranch(branchId: string, dto: ProvisionCafBranchDto = {}): Promise<any> {
    const branch = await this.findByIdRaw(branchId);
    const baseUrl = (branch.cafBaseUrl || this.configService.get<string>('caf.baseUrl') || '').replace(/\/$/, '');
    const adminUsername =
      this.configService.get<string>('caf.adminUsername') ||
      this.configService.get<string>('caf.username') ||
      '';
    const adminPassword =
      this.configService.get<string>('caf.adminPassword') ||
      this.configService.get<string>('caf.password') ||
      '';

    if (!baseUrl || !adminUsername || !adminPassword) {
      throw new BadRequestException('CAF base URL and CAF_ADMIN credentials are required before provisioning');
    }

    const token = await this.authenticateCaf(baseUrl, adminUsername, adminPassword);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const code = (branch.code || branch.name).toString().trim().toUpperCase();
    const username = dto.username || `emr_${code.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_pharmacy`;
    const password = dto.password || `Emr-${randomBytes(9).toString('base64url')}1!`;
    const email = dto.email || branch.email || `${username}@carefarm.example`;
    const [firstName, ...lastParts] = (dto.firstName || branch.name || 'EMR Branch').split(' ');

    let cafBranchId = branch.cafBranchId || '';
    if (!cafBranchId) {
      try {
        const branchResponse = await firstValueFrom(
          this.httpService.post(
            `${baseUrl}/branches`,
            {
              name: branch.name,
              code,
              address: branch.address,
              phone: branch.phone,
              email: branch.email,
              currencyCode: 'SLE',
            },
            { headers },
          ),
        );
        cafBranchId = this.pickCafId(branchResponse.data);
      } catch (error: any) {
        const status = error?.response?.status;
        const message = error?.response?.data?.message || error?.message || 'CAF branch creation failed';
        if (status === 403) {
          throw new BadRequestException('CAF credential is not allowed to create branches. Use a CAF admin credential for provisioning.');
        }
        throw new BadRequestException(message);
      }
    }

    if (!cafBranchId) {
      throw new BadRequestException('CAF branch was created but no branch ID was returned');
    }

    let userCreated = false;
    try {
      await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/users`,
          {
            username,
            email,
            password,
            firstName: dto.firstName || firstName || 'EMR',
            lastName: dto.lastName || lastParts.join(' ') || 'Pharmacy',
            role: 'branch_manager',
            branchId: cafBranchId,
            isActive: true,
          },
          { headers },
        ),
      );
      userCreated = true;
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'CAF branch user creation failed';
      if (!String(message).toLowerCase().includes('duplicate') && !String(message).toLowerCase().includes('exist')) {
        throw new BadRequestException(message);
      }
    }

    branch.cafEnabled = true;
    branch.cafBaseUrl = baseUrl;
    branch.cafUsername = username;
    if (userCreated || dto.password || !branch.cafPassword) {
      branch.cafPassword = password;
    }
    branch.cafBranchId = cafBranchId;
    branch.cafTerminalId = branch.cafTerminalId || 'emr-integration';
    const saved = await branch.save();
    return {
      branch: this.sanitize(saved),
      cafBranchId,
      cafUsername: username,
      generatedPassword: userCreated ? password : undefined,
      message: 'CAF branch and integration user provisioned',
    };
  }

  async batchCreateUsers(branchId: string, dto: BatchCreateUsersDto, requestingUserId: string): Promise<{
    created: Array<{ userId: string; fullName: string; role: string; email: string }>;
    errors: Array<{ email: string; error: string }>;
  }> {
    await this.findByIdRaw(branchId);

    const created: Array<{ userId: string; fullName: string; role: string; email: string }> = [];
    const errors: Array<{ email: string; error: string }> = [];

    for (const user of dto.users) {
      try {
        const result = await this.usersService.create({
          email: user.email,
          password: user.password,
          fullName: user.fullName,
          department: user.department,
        });

        try {
          await this.usersService.assignRole(result.id, user.role as UserRoleEnum, requestingUserId);
        } catch (roleErr) {
          this.logger.warn(`Role assignment failed for ${user.email}: ${roleErr}`);
        }

        try {
          await this.usersService.assignBranch(result.id, branchId);
        } catch (branchErr) {
          this.logger.warn(`Branch assignment failed for ${user.email}: ${branchErr}`);
        }

        created.push({
          userId: result.id,
          fullName: user.fullName,
          role: user.role,
          email: user.email,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ email: user.email, error: message });
      }
    }

    this.logger.log(`Batch create: ${created.length} created, ${errors.length} errors for branch ${branchId}`);
    return { created, errors };
  }
}
