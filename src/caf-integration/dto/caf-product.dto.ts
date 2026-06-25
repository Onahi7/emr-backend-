export class CafProduct {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  unit: string;
  quantityAvailable: number;
  calculatedStock?: number;
  availableStock?: number;
  stockQuantity?: number;
  reorderLevel: number;
  basePrice: number;
  suggestedRetailPrice: number;
  requiresPrescription: boolean;
  isControlled: boolean;
  isActive: boolean;
  packSizes?: Array<{
    code?: string;
    name: string;
    unit: string;
    quantityPerPack: number;
    sellingPrice: number;
    barcode?: string;
  }>;
}

export class CafStockInfo {
  productId: string;
  quantityAvailable: number;
  batchStock: Array<{
    batchId: string;
    lotNumber: string;
    expiryDate: string;
    quantityAvailable: number;
  }>;
}

export class CafAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
