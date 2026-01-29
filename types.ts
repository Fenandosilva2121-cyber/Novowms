
export enum Unit {
  UN = 'UN',
  KG = 'KG',
  LT = 'LT',
  CX = 'CX'
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: Unit;
  minStock: number;
  price: number;
}

export interface StorageLocation {
  id: string;
  code: string; // Ex: A-01-02 (Corredor-Nivel-Posicao)
  type: 'PICKING' | 'STORAGE';
  productId: string | null;
  quantity: number;
}

export interface PickingTask {
  id: string;
  orderNumber: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  items: {
    productId: string;
    locationId: string;
    requestedQty: number;
    pickedQty: number;
  }[];
  createdAt: string;
}

export interface InventoryAudit {
  id: string;
  date: string;
  locationId: string;
  productId: string;
  expectedQty: number;
  actualQty: number;
  status: 'ADJUSTED' | 'MATCHED';
}
