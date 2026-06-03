import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CafProduct, CafAuthResponse } from './dto/caf-product.dto';

interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  branchId?: string;
}

@Injectable()
export class CafIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(CafIntegrationService.name);
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private cafUserId: string | null = null;
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly branchId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
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

  async ensureAuthenticated(): Promise<{ accessToken: string; cafUserId: string }> {
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt && this.cafUserId) {
      return { accessToken: this.accessToken, cafUserId: this.cafUserId };
    }

    try {
      this.logger.log(`Authenticating with CAF at ${this.baseUrl}/auth/login as ${this.username}`);
      const { data } = await firstValueFrom(
        this.httpService.post<CafAuthResponse>(`${this.baseUrl}/auth/login`, {
          username: this.username,
          password: this.password,
        }),
      );

      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      this.tokenExpiresAt = new Date(Date.now() + data.expiresIn * 1000);

      const payload = this.decodeJwt(data.accessToken);
      this.cafUserId = payload?.sub || null;
      this.logger.log(`Authenticated with CAF as user ${this.cafUserId}`);
      return { accessToken: this.accessToken, cafUserId: this.cafUserId };
    } catch (error: any) {
      this.logger.error(`CAF authentication failed: ${error.message}`);
      throw error;
    }
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private idempotencyKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async searchProducts(query: string, branchId?: string): Promise<CafProduct[]> {
    if (!this.isConfigured()) return [];

    try {
      await this.ensureAuthenticated();
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/products/search`, {
          headers: this.headers,
          params: { query, branchId: branchId || this.branchId },
        }),
      );
      const result = data.data || data;
      if (Array.isArray(result) && result.length > 0) {
        return result;
      }
    } catch (error: any) {
      this.logger.error(`CAF product search failed: ${error.message}`);
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/products`, {
          headers: this.headers,
          params: { search: query, branchId: branchId || this.branchId },
        }),
      );
      const result = data.data || data;
      return Array.isArray(result) ? result : [];
    } catch (error: any) {
      this.logger.error(`CAF product search fallback failed: ${error.message}`);
      return [];
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
    if (!this.isConfigured()) {
      this.logger.warn('CAF not configured — skipping product fetch');
      return [];
    }
    try {
      await this.ensureAuthenticated();
      const { branchId, ...rest } = params;
      const cleanParams: Record<string, any> = { branchId: branchId || this.branchId };
      for (const [key, val] of Object.entries(rest)) {
        if (val !== undefined && val !== null && val !== '') {
          cleanParams[key] = val;
        }
      }
      this.logger.log(`CAF getProducts params: ${JSON.stringify(cleanParams)}`);
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/products`, {
          headers: this.headers,
          params: cleanParams,
        }),
      );
      this.logger.log(`CAF getProducts response keys: ${Object.keys(data)}, isArray: ${Array.isArray(data.data || data)}, count: ${(data.data || data).length}`);
      const result = data.data || data;
      return Array.isArray(result) ? result : [];
    } catch (error: any) {
      this.logger.error(`CAF product list failed: ${error.message}`);
      return [];
    }
  }

  async getProductByBarcode(barcode: string, branchId?: string): Promise<CafProduct | null> {
    if (!this.isConfigured()) return null;
    await this.ensureAuthenticated();

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/products/barcode/${barcode}`, {
          headers: this.headers,
          params: { branchId: branchId || this.branchId },
        }),
      );
      return data.data || data;
    } catch {
      return null;
    }
  }

  async getLowStockAlerts(branchId?: string): Promise<any[]> {
    if (!this.isConfigured()) return [];
    await this.ensureAuthenticated();

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/inventory/low-stock-alerts`, {
          headers: this.headers,
          params: { branchId: branchId || this.branchId },
        }),
      );
      return data.data || [];
    } catch {
      return [];
    }
  }

  async getProductStock(productId: string, branchId?: string): Promise<number> {
    if (!this.isConfigured()) return 0;
    await this.ensureAuthenticated();

    const effectiveBranchId = branchId || this.branchId;

    try {
      const productRes = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/products/${productId}`, {
          headers: this.headers,
        }),
      );
      const productStock = productRes?.data?.data?.quantityAvailable ?? productRes?.data?.quantityAvailable;
      if (typeof productStock === 'number') {
        return productStock;
      }

      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/inventory/product-stock`, {
          headers: this.headers,
          params: { branchId: effectiveBranchId, productId },
        }),
      );
      return data?.data?.calculatedStock ?? data?.data?.quantityAvailable ?? 0;
    } catch (error: any) {
      this.logger.error(`CAF stock check failed: ${error.message}`);
      return 0;
    }
  }

  async ensureOpenShift(branchId?: string): Promise<string> {
    const { cafUserId } = await this.ensureAuthenticated();
    const effectiveBranchId = branchId || this.branchId;

    const currentRes = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/shifts/current`, {
        headers: this.headers,
        params: { branchId: effectiveBranchId, cashierId: cafUserId, terminalId: 'emr-integration' },
      }),
    ).catch(() => ({ data: null }));

    const currentShift = currentRes?.data?.data;
    if (currentShift?._id) {
      return currentShift._id;
    }

    const openRes = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/shifts/open`,
        { branchId: effectiveBranchId, cashierId: cafUserId, terminalId: 'emr-integration', openingCash: 0 },
        {
          headers: {
            ...this.headers,
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
    items: Array<{ productId: string; quantity: number }>;
    patientName?: string;
    patientId?: string;
    prescriptionRef: string;
    paymentMethod?: string;
    notes?: string;
    branchId?: string;
  }): Promise<{ saleId: string; receiptNumber: string }> {
    await this.ensureAuthenticated();
    const effectiveBranchId = params.branchId || this.branchId;

    const checkoutItems = params.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: 0,
    }));

    const { data } = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/sales/checkout`,
        {
          branchId: effectiveBranchId,
          shiftId: params.shiftId,
          terminalId: 'emr-integration',
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
            ...this.headers,
            'X-Idempotency-Key': this.idempotencyKey('emr-checkout'),
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
