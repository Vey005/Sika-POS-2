// Global window augmentation for the context bridge API
interface Window {
  sikapos: {
    machineId?: string;
    machineName?: string;
    window: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      confirmClose: () => void;
    };
    /** After handling close (e.g. attendance), call window.confirmClose() to exit the app. */
    onCloseIntercepted: (callback: () => void) => () => void;
    inventory: {
      getAll: (filters?: { search?: string, category?: string, limit?: number, lowStock?: boolean, expiring?: boolean }) => Promise<Product[]>;
      search: (query: string) => Promise<Product[]>;
      getByBarcode: (barcode: string) => Promise<Product | null>;
      getById: (id: number) => Promise<Product | null>;
      getStockLevels: (ids: number[]) => Promise<Array<{ id: number; name: string; barcode?: string; category: string; unit_price: number; cost_price: number; stock_qty: number; is_inventory: number; stock_unit: string; size?: string; pack_size: number; pack_price?: number | null; pack_label?: string; tax_category: string }>>;
      save: (product: Partial<Product>) => Promise<{ id?: number; success: boolean; message?: string }>;
      delete: (id: number) => Promise<{ success: boolean; message?: string }>;
      adjustStock: (id: number, delta: number, reason: string) => Promise<{ success: boolean; message?: string }>;
      getCategories: () => Promise<string[]>;
      getSummary: () => Promise<{ total_items: number; total_stock: number; total_value_selling: number; total_value_cost: number }>;
      getLowStockCount: () => Promise<number>;
      getExpiringCount: () => Promise<number>;
      getCategorySummary: () => Promise<Array<{ category: string; item_count: number; total_stock: number; total_value: number }>>;
      importFromExcel: () => Promise<{ success: boolean; count?: number; message?: string }>;
      downloadTemplate: () => Promise<{ success: boolean; filePath?: string; message?: string }>;
      exportInventory: () => Promise<{ success: boolean; count?: number; filePath?: string; message?: string }>;
      clearAll: () => Promise<{ success: boolean; count?: number; message?: string }>;
      getBatches: (productId: number) => Promise<ProductBatch[]>;
    };
    sales: {
      create: (data: CreateTransactionInput) => Promise<TransactionResult>;
      getAll: (filters?: TransactionFilters) => Promise<Transaction[]>;
      getById: (id: number) => Promise<TransactionWithItems>;
      void: (id: number, reason: string) => Promise<{ success: boolean; message?: string }>;
      reverse: (id: number, reason: string) => Promise<{ success: boolean; message?: string }>;
      getSummary: (filters?: TransactionFilters) => Promise<TodaySummary>;
      getRecentTransactions: (limit: number) => Promise<Transaction[]>;
      getDailyReportData: (date: string) => Promise<{ summary: TodaySummary; transactions: any[]; itemSummary: any[] }>;
      hold: (data: { payload: any; customerName?: string }) => Promise<{ success: boolean; message?: string }>;
      getHeld: () => Promise<Array<{ id: number; payload: string; customer_name: string; created_at: string }>>;
      deleteHeld: (id: number) => Promise<{ success: boolean; message?: string }>;
      getByShift: (params: { cashierName: string; clockIn: string; clockOut?: string }) => Promise<{
        transactions: Transaction[];
        summary: TodaySummary;
        itemSummary?: Array<{ product_name: string; total_qty: number; product_size?: string }>;
      }>;
    };
    customers: {
      getAll: () => Promise<Customer[]>;
      search: (query: string) => Promise<Customer[]>;
      getById: (id: number) => Promise<CustomerWithHistory>;
      save: (customer: Partial<Customer>) => Promise<{ id?: number; success: boolean; message?: string }>;
      delete: (id: number) => Promise<{ success: boolean; message?: string }>;
      addCreditPayment: (customerId: number, amount: number, note: string, method?: string) => Promise<{ success: boolean; customer?: Customer; message?: string }>;
    };
    settings: {
      get: (key: string) => Promise<string | null>;
      set: (key: string, value: unknown) => Promise<{ success: boolean; message?: string }>;
      getAll: () => Promise<Record<string, string>>;
      setBusiness: (data: BusinessSettings) => Promise<{ success: boolean; message?: string }>;
      getBusiness: () => Promise<Record<string, string>>;
    };
    printer: {
      listPrinters: () => Promise<Array<{ id: string; name: string }>>;
      printReceipt: (receipt: any) => Promise<void>;
      printKitchenReceipt: (order: any) => Promise<void>;
      printReport: (report: any) => Promise<void>;
      printLowStock: (payload: {
        businessName: string;
        printedAt?: string;
        items: Array<{ name: string; barcode?: string; stock_qty: number; low_stock_threshold: number }>;
        config?: { paperSize?: string; currency?: string; [key: string]: unknown };
      }) => Promise<{ success: boolean }>;
      testPrint: () => Promise<void>;
      openDrawer: () => Promise<void>;
      saveAsPDF: (data: any, type: 'receipt' | 'report') => Promise<{ success: boolean; filePath?: string }>;
    };
    scanner: {
      onScan: (callback: (barcode: string) => void) => () => void;
    };
    sync: {
      forceSync: () => Promise<{ success: boolean }>;
      restore: () => Promise<{ success: boolean; count?: number; message?: string }>;
      getPendingCount: () => Promise<number>;
      queueItem: (item: { entity: string; operation: string; payload: unknown; priority?: number }) => Promise<{ success: boolean }>;
      onStatusChange: (callback: (status: 'synced' | 'syncing' | 'error', pendingCount?: number) => void) => () => void;
      onUsersUpdated: (callback: () => void) => () => void;
    };
    users: {
      getAll: () => Promise<Array<{ id: number; name: string; role: string; created_at: string; updated_at: string; cashier_nav_visibility?: string | null }>>;
      getById: (id: number) => Promise<{ id: number; name: string; role: string; cashier_nav_visibility?: string | null } | null>;
      save: (user: {
        id?: number;
        name: string;
        password?: string;
        pin?: string;
        role: string;
        cashier_nav_visibility?: string | null;
      }) => Promise<{ success: boolean; id?: number; message?: string }>;
      delete: (id: number) => Promise<{ success: boolean; message?: string }>;
      login: (password: string) => Promise<{ id: number; name: string; role: string } | { locked: true; secondsLeft: number } | null>;
      loginById: (userId: number, password: string) => Promise<{ id: number; name: string; role: string } | { locked: true; secondsLeft: number } | null>;
      resetPassword: (data: { userId: number; licenseKey: string; newPassword: string; newPin?: string }) => Promise<{ success: boolean; message?: string }>;
      resetPin: (data: { userId: number; licenseKey: string; newPin: string }) => Promise<{ success: boolean; message?: string }>;
    };
    secureStore: {
      get: (key: string) => Promise<any>;
      set: (key: string, value: any) => Promise<{ success: boolean; message?: string }>;
      delete: (key: string) => Promise<{ success: boolean; message?: string }>;
      getAll: () => Promise<Record<string, any>>;
    };
    notifications: {
      show: (title: string, body: string, data?: any) => Promise<{ success: boolean }>;
      sendOfficial: (to: string, message: string) => Promise<{ success: boolean; message?: string }>;
      onClick: (callback: (data: any) => void) => () => void;
    };
    attendance: {
      clockIn: (userId: number) => Promise<{ success: boolean; message?: string }>;
      clockOut: (userId: number) => Promise<{ success: boolean; message?: string }>;
      getStatus: (userId: number) => Promise<{ id: number; user_id: number; type: 'in' | 'out'; created_at: string } | null>;
      getHistory: (userId?: number, range?: { from?: string; to?: string }) => Promise<any[]>;
    };
    restock: {
      getAll: (filters?: { search?: string; limit?: number }) => Promise<RestockInvoice[]>;
      getById: (id: number) => Promise<RestockInvoiceWithItems | null>;
      create: (input: {
        invoice_number?: string;
        supplier_name?: string;
        notes?: string;
        is_paid?: number;
        created_by?: string;
        items: Array<{
          product_id: number;
          product_name: string;
          quantity: number;
          cost_price: number;
          expiry_date?: string;
          batch_number?: string;
        }>;
      }) => Promise<{ success: boolean; id?: number; invoice_number?: string; message?: string }>;
      delete: (id: number) => Promise<{ success: boolean; message?: string }>;
      togglePaid: (id: number) => Promise<{ success: boolean; invoice?: RestockInvoice; message?: string }>;
    };
    updates: {
      getState: () => Promise<{
        status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
        currentVersion: string;
        availableVersion?: string;
        releaseNotes?: string;
        percent?: number;
        message?: string;
        error?: string;
      }>;
      check: () => Promise<{
        status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
        currentVersion: string;
        availableVersion?: string;
        releaseNotes?: string;
        percent?: number;
        message?: string;
        error?: string;
      }>;
      download: () => Promise<{
        status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
        currentVersion: string;
        availableVersion?: string;
        releaseNotes?: string;
        percent?: number;
        message?: string;
        error?: string;
      }>;
      install: () => Promise<{ success: boolean }>;
      onState: (callback: (state: {
        status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
        currentVersion: string;
        availableVersion?: string;
        releaseNotes?: string;
        percent?: number;
        message?: string;
        error?: string;
      }) => void) => () => void;
      onAvailable: (callback: (payload: { version: string }) => void) => () => void;
      onDownloaded: (callback: (payload: { version: string }) => void) => () => void;
    };
  };
}

interface Product {
  id: number;
  name: string;
  barcode?: string;
  category: string;
  unit_price: number;
  cost_price: number;
  stock_qty: number;
  low_stock_threshold: number;
  tax_category: 'standard' | 'zero_rated' | 'exempt';
  is_active: number;
  is_pharmacy: number;
  is_inventory: number;
  expiry_date?: string;
  /** Months before expiry_date to flag this SKU (null = shop default). */
  expiry_alert_months?: number | null;
  batch_number?: string;
  nafdac_number?: string;
  unit: string;
  pack_size?: number;
  pack_price?: number | null;
  pack_label?: string;
  stock_unit?: 'single' | 'pack';
  size?: string;
  image_path?: string;
  created_at: string;
  updated_at: string;
}

interface CartItem {
  cart_key: string;
  product_id: number;
  product_name: string;
  product_barcode?: string;
  product_size?: string;
  category: string;
  quantity: number;
  sale_unit?: 'single' | 'pack';
  stock_unit?: 'single' | 'pack';
  unit_multiplier?: number;
  unit_price: number;
  cost_price: number;
  stock_qty: number;
  is_inventory: number;
  tax_category: string;
  adjusted_price?: number;
  original_price?: number;
}

interface TaxBreakdown {
  subtotal: number;
  vat: number;
  nhil: number;
  getfund: number;
  covid: number;
  totalTax: number;
  grandTotal: number;
}

interface CreateTransactionInput {
  items: CartItem[];
  customer_id?: number;
  customer_name?: string;
  cashier_name: string;
  payment_method: string;
  discount_amount: number;
  discount_type?: string;
  amount_tendered: number;
  momo_reference?: string;
  order_type?: string;
  order_note?: string;
  split_cash?: number;
  split_momo?: number;
}

interface TransactionResult {
  id: number;
  receiptNumber: string;
  grandTotal: number;
  changeGiven: number;
  paymentMethod: string;
  amountTendered: number;
  status: string;
  paidAmount: number;
  tax: TaxBreakdown;
  customerName?: string;
  /** Present after a credit sale: customer account balance including this sale. */
  customerCreditBalanceAfter?: number;
}

interface TransactionFilters {
  from?: string;
  to?: string;
  status?: string;
  cashier_name?: string;
}

interface Transaction {
  id: number;
  receipt_number: string;
  customer_id?: number;
  customer_name?: string;
  cashier_name: string;
  status: string;
  payment_method: string;
  subtotal: number;
  discount_amount: number;
  tax_vat: number;
  tax_nhil: number;
  tax_getfund: number;
  tax_covid: number;
  total_tax: number;
  grand_total: number;
  amount_tendered: number;
  change_given: number;
  momo_reference?: string;
  void_reason?: string;
  item_count?: number;
  split_cash?: number;
  split_momo?: number;
  created_at: string;
}

interface TransactionItem {
  id: number;
  transaction_id: number;
  product_id?: number;
  product_name: string;
  product_barcode?: string;
  category: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  line_total: number;
  tax_category: string;
}

interface TransactionWithItems extends Transaction {
  items: TransactionItem[];
}

interface TodaySummary {
  transaction_count: number;
  total_revenue: number;
  avg_basket: number;
  cash_total: number;
  momo_total: number;
  card_total: number;
  credit_total: number;
  credit_issued_total?: number;
  outstanding_credit?: number;
  debt_recovered?: number;
}

interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  credit_balance: number;
  credit_limit: number;
  loyalty_points: number;
  total_spent: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface CustomerWithHistory extends Customer {
  creditLog: Array<{ id: number; amount: number; type: string; note: string; created_at: string }>;
  recentSales: Transaction[];
}

interface BusinessSettings {
  business_name: string;
  business_address: string;
  business_phone: string;
  cashier_name: string;
  receipt_footer: string;
  tin?: string;
  owner_whatsapp?: string;
  notification_provider?: 'whatsapp' | 'sms';
  sms_api_key?: string;
  sms_sender_id?: string;
  custom_categories?: string;
  tax_config?: string;
  receipt_config?: string;
  cashier_nav_visibility?: string;
  expiry_alert_months_default?: string;
  tax_enabled?: string;
}

interface RestockInvoice {
  id: number;
  invoice_number: string;
  supplier_name?: string;
  notes?: string;
  is_paid: number;
  total_cost: number;
  total_items: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface RestockInvoiceItem {
  id: number;
  invoice_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  cost_price: number;
  expiry_date?: string;
  batch_number?: string;
  created_at: string;
}

interface RestockInvoiceWithItems extends RestockInvoice {
  items: RestockInvoiceItem[];
}

interface ProductBatch {
  id: number;
  batch_number?: string;
  expiry_date?: string;
  cost_price: number;
  stock_qty: number;
  created_at: string;
}
