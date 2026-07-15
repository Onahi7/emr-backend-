import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { CafProduct, CafAuthResponse } from './dto/caf-product.dto';
import { Branch, BranchDocument } from '../branches/branch.schema';

interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  branchId?: string;
}

interface CafResolvedConfig {
  baseUrl: string;
  username: string;
  password: string;
  branchId: string;
  terminalId: string;
  key: string;
}

interface CafAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  cafUserId: string | null;
}

@Injectable()
export class CafIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(CafIntegrationService.name);
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private cafUserId: string | null = null;
  private readonly authByConfig = new Map<string, CafAuthState>();
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly branchId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
  ) {
    this.baseUrl = this.configService.get<string>('caf.baseUrl', '');
    this.username = this.configService.get<string>('caf.username', '');
    this.password = this.configService.get<string>('caf.password', '');
    this.branchId = this.configService.get<string>('caf.branchId', '');
  }

  async onModuleInit() {
    if (this.isConfigured()) {
      this.logger.log('CAF integration configured, will authenticate on first request');
    } else {
      this.logger.warn('CAF integration not configured — set CAF_API_* env vars');
    }
  }

  isConfigured(): boolean {
    return !!(this.baseUrl && this.username && this.password && this.branchId);
  }

  async isConfiguredForBranch(branchId?: string): Promise<boolean> {
    return Boolean(await this.resolveConfig(branchId));
  }

  private async resolveConfig(branchId?: string): Promise<CafResolvedConfig | null> {
    const branch = branchId
      ? await this.branchModel.findById(branchId).lean().exec().catch(() => null)
      : null;

    if (branch && branch.cafEnabled === false && !branch.cafBranchId) {
      return null;
    }

    let baseUrl: string;
    let username: string;
    let password: string;
    let cafBranchId: string;
    let terminalId: string;

    if (branch) {
      baseUrl = (branch.cafBaseUrl || '').replace(/\/$/, '');
      username = branch.cafUsername || '';
      password = branch.cafPassword || '';
      cafBranchId = branch.cafBranchId || '';
      terminalId = branch.cafTerminalId || 'emr-integration';

      if (!baseUrl || !username || !password || !cafBranchId) {
        return null;
      }
    } else {
      baseUrl = (this.baseUrl || '').replace(/\/$/, '');
      username = this.username || '';
      password = this.password || '';
      cafBranchId = this.branchId || '';
      terminalId = 'emr-integration';

      if (!baseUrl || !username || !password || !cafBranchId) {
        return null;
      }
    }

    return {
      baseUrl,
      username,
      password,
      branchId: cafBranchId,
      terminalId,
      key: `${baseUrl}|${username}|${cafBranchId}|${terminalId}`,
    };
  }

  getConfigStatus(): { configured: boolean; baseUrl: string; username: string; branchId: string; authenticated: boolean } {
    return {
      configured: this.isConfigured(),
      baseUrl: this.baseUrl ? `${this.baseUrl.substring(0, 30)}...` : 'NOT SET',
      username: this.username || 'NOT SET',
      branchId: this.branchId || 'NOT SET',
      authenticated: !!(this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt),
    };
  }

  getBranchId(): string {
    return this.branchId;
  }

  getCafUserId(): string | null {
    return this.cafUserId;
  }

  private decodeJwt(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    } catch {
      return null;
    }
  }

  async ensureAuthenticated(forceRefresh = false, branchId?: string): Promise<{ accessToken: string; cafUserId: string; config: CafResolvedConfig }> {
    const config = await this.resolveConfig(branchId);
    if (!config) {
      throw new Error('CAF integration is not configured for this branch');
    }

    const cached = this.authByConfig.get(config.key);
    if (!forceRefresh && cached?.accessToken && cached.tokenExpiresAt && new Date() < cached.tokenExpiresAt && cached.cafUserId) {
      return { accessToken: cached.accessToken, cafUserId: cached.cafUserId, config };
    }

    try {
      this.logger.log(`Authenticating with CAF at ${config.baseUrl}/auth/login as ${config.username}`);
      const { data } = await firstValueFrom(
        this.httpService.post<CafAuthResponse>(`${config.baseUrl}/auth/login`, {
          username: config.username,
          password: config.password,
        }),
      );

      const payload = this.decodeJwt(data.accessToken);
      const state: CafAuthState = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenExpiresAt: new Date(Date.now() + data.expiresIn * 1000),
        cafUserId: payload?.sub || null,
      };
      this.authByConfig.set(config.key, state);

      if (!branchId) {
        this.accessToken = state.accessToken;
        this.refreshToken = state.refreshToken;
        this.tokenExpiresAt = state.tokenExpiresAt;
        this.cafUserId = state.cafUserId;
      }

      this.logger.log(`Authenticated with CAF as user ${state.cafUserId}`);
      return { accessToken: state.accessToken!, cafUserId: state.cafUserId!, config };
    } catch (error: any) {
      this.logger.error(`CAF authentication failed: ${error.message}`);
      throw error;
    }
  }

  private invalidateAuth(): void {
    this.authByConfig.clear();
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.cafUserId = null;
    this.logger.log('CAF auth invalidated — will re-authenticate on next request');
  }

  private headers(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private idempotencyKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async searchProducts(query: string, branchId?: string): Promise<CafProduct[]> {
    const initialConfig = await this.resolveConfig(branchId);
    if (!initialConfig) return [];
    const searchBranchId = initialConfig.branchId;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const auth = await this.ensureAuthenticated(attempt > 0, branchId);
        this.logger.log(`CAF searchProducts query="${query}" branchId="${searchBranchId}"${attempt > 0 ? ' (retry)' : ''}`);
        const { data } = await firstValueFrom(
          this.httpService.get(`${auth.config.baseUrl}/products/search`, {
            headers: this.headers(auth.accessToken),
            params: { query, branchId: searchBranchId },
          }),
        );
        const result = data.data || data;
        if (Array.isArray(result) && result.length > 0) {
          this.logger.log(`CAF searchProducts found ${result.length} results`);
          return result;
        }
        this.logger.warn(`CAF searchProducts returned non-array or empty: ${JSON.stringify(data).substring(0, 200)}`);
      } catch (error: any) {
        if (error.response?.status === 401 && attempt === 0) {
          this.logger.warn('CAF searchProducts 401 — invalidating and retrying...');
          this.invalidateAuth();
          continue;
        }
        this.logger.error(`CAF product search failed: ${error.message}`);
        if (error.response) {
          this.logger.error(`CAF search response: status=${error.response.status}, data=${JSON.stringify(error.response.data).substring(0, 200)}`);
        }
      }
    }

    try {
      this.logger.log(`CAF searchProducts fallback to /products?search="${query}"`);
      const auth = await this.ensureAuthenticated(false, branchId);
      const { data } = await firstValueFrom(
        this.httpService.get(`${auth.config.baseUrl}/products`, {
          headers: this.headers(auth.accessToken),
          params: { search: query, branchId: searchBranchId },
        }),
      );
      const result = data.data || data;
      return Array.isArray(result) ? result : [];
    } catch (error: any) {
      this.logger.error(`CAF product search fallback failed: ${error.message}`);
      return [];
    }
  }

  async getProductsDebug(params: {
    search?: string;
    category?: string;
    barcode?: string;
    page?: number;
    limit?: number;
    branchId?: string;
  } = {}): Promise<{ products: CafProduct[]; raw: any }> {
    const initialConfig = await this.resolveConfig(params.branchId);
    if (!initialConfig) {
      this.logger.warn('CAF not configured — skipping product fetch');
      return { products: [], raw: { error: 'not configured' } };
    }
    const doFetch = async (isRetry: boolean) => {
      const auth = await this.ensureAuthenticated(isRetry, params.branchId);
      const { branchId, ...rest } = params;
      const cleanParams: Record<string, any> = { branchId: auth.config.branchId };
      for (const [key, val] of Object.entries(rest)) {
        if (val !== undefined && val !== null && val !== '') {
          cleanParams[key] = val;
        }
      }
      this.logger.log(`CAF getProductsDebug params: ${JSON.stringify(cleanParams)}${isRetry ? ' (retry after 401)' : ''}`);
      const axiosResponse = await firstValueFrom(
        this.httpService.get(`${auth.config.baseUrl}/products`, {
          headers: this.headers(auth.accessToken),
          params: cleanParams,
        }),
      );
      return axiosResponse;
    };

    try {
      const axiosResponse = await doFetch(false);
      const raw = {
        status: axiosResponse.status,
        dataPreview: JSON.stringify(axiosResponse.data).substring(0, 500),
      };
      const result = axiosResponse.data.data || axiosResponse.data;
      return { products: Array.isArray(result) ? result : [], raw };
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.logger.warn('CAF returned 401 — invalidating token and retrying...');
        this.invalidateAuth();
        try {
          const axiosResponse = await doFetch(true);
          const raw = {
            status: axiosResponse.status,
            dataPreview: JSON.stringify(axiosResponse.data).substring(0, 500),
          };
          const result = axiosResponse.data.data || axiosResponse.data;
          return { products: Array.isArray(result) ? result : [], raw };
        } catch (retryError: any) {
          this.logger.error(`CAF retry after 401 also failed: ${retryError.message}`);
          return { products: [], raw: { error: retryError.message, responseStatus: retryError.response?.status } };
        }
      }
      this.logger.error(`CAF getProductsDebug failed: ${error.message}`);
      return { products: [], raw: { error: error.message, responseStatus: error.response?.status } };
    }
  }

  async getProducts(params: {
    search?: string;
    category?: string;
    barcode?: string;
    page?: number;
    limit?: number;
    branchId?: string;
  } = {}): Promise<CafProduct[]> {
    const initialConfig = await this.resolveConfig(params.branchId);
    if (!initialConfig) {
      this.logger.warn('CAF not configured — skipping product fetch');
      return [];
    }
    const buildParams = (cafBranchId: string) => {
      const { branchId, ...rest } = params;
      const cleanParams: Record<string, any> = { branchId: cafBranchId };
      for (const [key, val] of Object.entries(rest)) {
        if (val !== undefined && val !== null && val !== '') {
          cleanParams[key] = val;
        }
      }
      return cleanParams;
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const auth = await this.ensureAuthenticated(attempt > 0, params.branchId);
        const cleanParams = buildParams(auth.config.branchId);
        this.logger.log(`CAF getProducts params: ${JSON.stringify(cleanParams)}`);
        const { data } = await firstValueFrom(
          this.httpService.get(`${auth.config.baseUrl}/products`, {
            headers: this.headers(auth.accessToken),
            params: cleanParams,
          }),
        );
        this.logger.log(`CAF getProducts response keys: ${Object.keys(data)}, isArray: ${Array.isArray(data.data || data)}, count: ${(data.data || data).length}`);
        const result = data.data || data;
        if (!Array.isArray(result)) {
          this.logger.warn(`CAF getProducts unexpected response shape: ${JSON.stringify(data).substring(0, 200)}`);
          return [];
        }
        return result;
      } catch (error: any) {
        if (error.response?.status === 401 && attempt === 0) {
          this.logger.warn('CAF getProducts 401 — invalidating token and retrying...');
          this.invalidateAuth();
          continue;
        }
        this.logger.error(`CAF product list failed: ${error.message}`);
        if (error.response) {
          this.logger.error(`CAF response status: ${error.response.status}, data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        }
        return [];
      }
    }
    return [];
  }

  async getProductByBarcode(barcode: string, branchId?: string): Promise<CafProduct | null> {
    const initialConfig = await this.resolveConfig(branchId);
    if (!initialConfig) return null;
    const auth = await this.ensureAuthenticated(false, branchId);

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${auth.config.baseUrl}/products/barcode/${barcode}`, {
          headers: this.headers(auth.accessToken),
          params: { branchId: auth.config.branchId },
        }),
      );
      return data.data || data;
    } catch {
      return null;
    }
  }

  async getProductById(productId: string, branchId?: string): Promise<CafProduct | null> {
    const initialConfig = await this.resolveConfig(branchId);
    if (!initialConfig) return null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const auth = await this.ensureAuthenticated(attempt > 0, branchId);
        const { data } = await firstValueFrom(
          this.httpService.get(`${auth.config.baseUrl}/products/${productId}`, {
            headers: this.headers(auth.accessToken),
          }),
        );
        return data.data || data;
      } catch (error: any) {
        if (error.response?.status === 401 && attempt === 0) {
          this.invalidateAuth();
          continue;
        }
        this.logger.error(`CAF product lookup failed: ${error.message}`);
        return null;
      }
    }

    return null;
  }

  async getLowStockAlerts(branchId?: string): Promise<any[]> {
    const initialConfig = await this.resolveConfig(branchId);
    if (!initialConfig) return [];
    const auth = await this.ensureAuthenticated(false, branchId);

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${auth.config.baseUrl}/inventory/low-stock-alerts`, {
          headers: this.headers(auth.accessToken),
          params: { branchId: auth.config.branchId },
        }),
      );
      return data.data || [];
    } catch {
      return [];
    }
  }

  async getProductStock(productId: string, branchId?: string): Promise<number> {
    const initialConfig = await this.resolveConfig(branchId);
    if (!initialConfig) return 0;
    const auth = await this.ensureAuthenticated(false, branchId);
    const effectiveBranchId = auth.config.branchId;

    try {
      const productRes = await firstValueFrom(
        this.httpService.get(`${auth.config.baseUrl}/products/${productId}`, {
          headers: this.headers(auth.accessToken),
        }),
      );
      const product = productRes?.data?.data ?? productRes?.data;
      const productStock =
        product?.quantityAvailable ??
        product?.stockAvailable ??
        product?.stock ??
        product?.calculatedStock ??
        product?.availableStock ??
        product?.stockQuantity;
      if (typeof productStock === 'number') {
        return productStock;
      }

      const { data } = await firstValueFrom(
        this.httpService.get(`${auth.config.baseUrl}/inventory/product-stock`, {
          headers: this.headers(auth.accessToken),
          params: { branchId: effectiveBranchId, productId },
        }),
      );
      return data?.data?.calculatedStock ?? data?.data?.quantityAvailable ?? data?.data?.stockAvailable ?? data?.data?.stock ?? data?.data?.availableStock ?? 0;
    } catch (error: any) {
      this.logger.error(`CAF stock check failed: ${error.message}`);
      return 0;
    }
  }

  async ensureOpenShift(branchId?: string): Promise<string> {
    const { cafUserId, accessToken, config } = await this.ensureAuthenticated(false, branchId);
    const effectiveBranchId = config.branchId;

    const currentRes = await firstValueFrom(
      this.httpService.get(`${config.baseUrl}/shifts/current`, {
        headers: this.headers(accessToken),
        params: { branchId: effectiveBranchId, cashierId: cafUserId, terminalId: config.terminalId },
      }),
    ).catch(() => ({ data: null }));

    const currentShift = currentRes?.data?.data;
    if (currentShift?._id) {
      return currentShift._id;
    }

    const openRes = await firstValueFrom(
      this.httpService.post(
        `${config.baseUrl}/shifts/open`,
        { branchId: effectiveBranchId, cashierId: cafUserId, terminalId: config.terminalId, openingCash: 0 },
        {
          headers: {
            ...this.headers(accessToken),
            'X-Idempotency-Key': this.idempotencyKey('emr-shift-open'),
          },
        },
      ),
    );

    const shiftId = openRes?.data?.data?._id;
    if (!shiftId) {
      throw new Error('Failed to open CAF shift');
    }
    this.logger.log(`Opened CAF shift ${shiftId}`);
    return shiftId;
  }

  async dispensePrescription(params: {
    shiftId: string;
    items: Array<{
      productId: string;
      quantity: number;
      quantityInBaseUnits?: number;
      packSize?: {
        code?: string;
        name: string;
        unit: string;
        quantityPerPack: number;
        barcode?: string;
      };
    }>;
    patientName?: string;
    patientId?: string;
    prescriptionRef: string;
    paymentMethod?: string;
    notes?: string;
    branchId?: string;
    idempotencyKey: string;
  }): Promise<{ saleId: string; receiptNumber: string }> {
    const auth = await this.ensureAuthenticated(false, params.branchId);
    const effectiveBranchId = auth.config.branchId;

    const checkoutItems = params.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: 0,
      ...(item.quantityInBaseUnits ? { quantityInBaseUnits: item.quantityInBaseUnits } : {}),
      ...(item.packSize ? { packSize: item.packSize } : {}),
    }));

    const { data } = await firstValueFrom(
      this.httpService.post(
        `${auth.config.baseUrl}/sales/checkout`,
        {
          branchId: effectiveBranchId,
          shiftId: params.shiftId,
          terminalId: auth.config.terminalId,
          items: checkoutItems,
          paymentMethod: params.paymentMethod || 'cash',
          customerName: params.patientName || 'EMR Patient',
          patientId: params.patientId || '',
          patientName: params.patientName || '',
          sourceSystem: 'emr',
          notes: `EMR Prescription ${params.prescriptionRef}` + (params.notes ? ` - ${params.notes}` : ''),
        },
        {
          headers: {
            ...this.headers(auth.accessToken),
            'X-Idempotency-Key': params.idempotencyKey,
          },
        },
      ),
    );

    return {
      saleId: data.data.saleId,
      receiptNumber: data.data.receiptNumber,
    };
  }
}
