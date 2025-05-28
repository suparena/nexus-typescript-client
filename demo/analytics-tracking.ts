/**
 * Analytics Tracking Example for Nexus TypeScript Client
 * 
 * This example demonstrates real-world analytics tracking patterns for
 * e-commerce, user behavior, performance monitoring, and business metrics.
 */

import { NexusClient, NexusEvent } from '../index';

// Initialize client
const client = new NexusClient({
  url: process.env.NEXUS_ENDPOINT || 'https://api.example.com/events',
  token: process.env.NEXUS_TOKEN || 'your-api-token-here'
});

/**
 * E-commerce Analytics Tracker
 */
class EcommerceAnalytics {
  private sessionId: string;
  private cartItems: Map<string, { quantity: number; price: number }> = new Map();

  constructor(private client: NexusClient) {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async trackProductView(product: {
    id: string;
    name: string;
    category: string;
    price: number;
    brand?: string;
  }, userId?: string): Promise<void> {
    await this.client.send({
      type: 'product.viewed',
      sessionId: this.sessionId,
      userId,
      product: {
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        brand: product.brand
      },
      timestamp: new Date().toISOString(),
      context: this.getContext()
    });
    
    console.log(`👁️  Tracked product view: ${product.name}`);
  }

  async trackAddToCart(product: {
    id: string;
    name: string;
    price: number;
    quantity: number;
  }, userId?: string): Promise<void> {
    // Update local cart state
    const existing = this.cartItems.get(product.id);
    if (existing) {
      existing.quantity += product.quantity;
    } else {
      this.cartItems.set(product.id, { 
        quantity: product.quantity, 
        price: product.price 
      });
    }

    await this.client.send({
      type: 'cart.item_added',
      sessionId: this.sessionId,
      userId,
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: product.quantity
      },
      cart: {
        totalItems: Array.from(this.cartItems.values())
          .reduce((sum, item) => sum + item.quantity, 0),
        totalValue: Array.from(this.cartItems.entries())
          .reduce((sum, [_, item]) => sum + (item.price * item.quantity), 0)
      },
      timestamp: new Date().toISOString()
    });
    
    console.log(`🛒 Added to cart: ${product.quantity}x ${product.name}`);
  }

  async trackCheckoutStarted(userId: string): Promise<void> {
    const items = Array.from(this.cartItems.entries()).map(([id, item]) => ({
      productId: id,
      quantity: item.quantity,
      price: item.price
    }));

    await this.client.send({
      type: 'checkout.started',
      sessionId: this.sessionId,
      userId,
      cart: {
        items,
        totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
        totalValue: items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      },
      timestamp: new Date().toISOString()
    });
    
    console.log('💳 Checkout started');
  }

  async trackPurchase(order: {
    orderId: string;
    userId: string;
    items: Array<{
      productId: string;
      name: string;
      quantity: number;
      price: number;
    }>;
    total: number;
    tax: number;
    shipping: number;
    paymentMethod: string;
  }): Promise<void> {
    // Send main purchase event
    await this.client.send({
      type: 'purchase.completed',
      sessionId: this.sessionId,
      orderId: order.orderId,
      userId: order.userId,
      revenue: {
        total: order.total,
        tax: order.tax,
        shipping: order.shipping,
        subtotal: order.total - order.tax - order.shipping
      },
      paymentMethod: order.paymentMethod,
      itemCount: order.items.length,
      timestamp: new Date().toISOString()
    });

    // Send individual item events for detailed analysis
    const itemEvents = order.items.map(item => ({
      type: 'purchase.item' as const,
      sessionId: this.sessionId,
      orderId: order.orderId,
      userId: order.userId,
      product: {
        id: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        revenue: item.price * item.quantity
      },
      timestamp: new Date().toISOString()
    }));

    await this.client.send(itemEvents);
    
    console.log(`💰 Purchase completed: $${order.total} (${order.items.length} items)`);
    
    // Clear cart after purchase
    this.cartItems.clear();
  }

  private getContext() {
    // In browser environment
    if (typeof window !== 'undefined') {
      return {
        userAgent: navigator.userAgent,
        language: navigator.language,
        referrer: document.referrer,
        url: window.location.href,
        screen: {
          width: window.screen.width,
          height: window.screen.height
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      };
    }
    
    // In Node.js environment
    return {
      platform: 'node',
      version: process.version
    };
  }
}

/**
 * User Behavior Analytics
 */
class UserBehaviorAnalytics {
  private sessionStartTime: number;
  private pageViews: string[] = [];
  private interactions: number = 0;
  private errors: number = 0;

  constructor(
    private client: NexusClient,
    private sessionId: string,
    private userId?: string
  ) {
    this.sessionStartTime = Date.now();
    this.trackSessionStart();
  }

  private async trackSessionStart(): Promise<void> {
    await this.client.send({
      type: 'session.start',
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      context: {
        entryPage: typeof window !== 'undefined' ? window.location.pathname : '/',
        referrer: typeof document !== 'undefined' ? document.referrer : null,
        utm: this.parseUTMParams()
      }
    });
    
    console.log('🎬 Session started');
  }

  async trackPageView(page: string, title?: string): Promise<void> {
    this.pageViews.push(page);
    
    await this.client.send({
      type: 'page.view',
      sessionId: this.sessionId,
      userId: this.userId,
      page: {
        path: page,
        title: title || page,
        viewOrder: this.pageViews.length,
        timeOnPreviousPage: this.calculateTimeOnPreviousPage()
      },
      timestamp: new Date().toISOString()
    });
    
    console.log(`📄 Page view: ${page}`);
  }

  async trackInteraction(element: string, action: string, value?: any): Promise<void> {
    this.interactions++;
    
    await this.client.send({
      type: 'user.interaction',
      sessionId: this.sessionId,
      userId: this.userId,
      interaction: {
        element,
        action,
        value,
        interactionNumber: this.interactions
      },
      timestamp: new Date().toISOString()
    });
    
    console.log(`👆 Interaction: ${action} on ${element}`);
  }

  async trackSearch(query: string, results: number): Promise<void> {
    await this.client.send({
      type: 'search.performed',
      sessionId: this.sessionId,
      userId: this.userId,
      search: {
        query,
        results,
        hasResults: results > 0
      },
      timestamp: new Date().toISOString()
    });
    
    console.log(`🔍 Search: "${query}" (${results} results)`);
  }

  async trackError(error: {
    message: string;
    stack?: string;
    type: 'client' | 'network' | 'validation';
    context?: any;
  }): Promise<void> {
    this.errors++;
    
    await this.client.send({
      type: 'error.occurred',
      sessionId: this.sessionId,
      userId: this.userId,
      error: {
        message: error.message,
        stack: error.stack,
        type: error.type,
        context: error.context,
        errorNumber: this.errors
      },
      timestamp: new Date().toISOString()
    });
    
    console.log(`❌ Error tracked: ${error.type} - ${error.message}`);
  }

  async trackEngagement(score: number, factors: Record<string, number>): Promise<void> {
    await this.client.send({
      type: 'engagement.measured',
      sessionId: this.sessionId,
      userId: this.userId,
      engagement: {
        score,
        factors,
        sessionDuration: Date.now() - this.sessionStartTime,
        pageViews: this.pageViews.length,
        interactions: this.interactions
      },
      timestamp: new Date().toISOString()
    });
    
    console.log(`📊 Engagement score: ${score}`);
  }

  async endSession(): Promise<void> {
    const duration = Date.now() - this.sessionStartTime;
    
    await this.client.send({
      type: 'session.end',
      sessionId: this.sessionId,
      userId: this.userId,
      summary: {
        duration: Math.floor(duration / 1000), // seconds
        pageViews: this.pageViews.length,
        uniquePages: new Set(this.pageViews).size,
        interactions: this.interactions,
        errors: this.errors,
        exitPage: this.pageViews[this.pageViews.length - 1]
      },
      timestamp: new Date().toISOString()
    });
    
    console.log(`🏁 Session ended (${Math.floor(duration / 1000)}s)`);
  }

  private calculateTimeOnPreviousPage(): number | null {
    // Simplified calculation - in production, track actual page load times
    return this.pageViews.length > 1 ? Math.floor(Math.random() * 30) + 5 : null;
  }

  private parseUTMParams(): Record<string, string> | null {
    if (typeof window === 'undefined') return null;
    
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(key => {
      const value = params.get(key);
      if (value) utm[key] = value;
    });
    
    return Object.keys(utm).length > 0 ? utm : null;
  }
}

/**
 * Performance Monitoring
 */
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  constructor(private client: NexusClient, private service: string) {}

  async trackAPICall(endpoint: string, method: string, duration: number, status: number): Promise<void> {
    // Store metrics for aggregation
    const key = `${method}:${endpoint}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key)!.push(duration);

    await this.client.send({
      type: 'api.performance',
      service: this.service,
      endpoint,
      method,
      performance: {
        duration,
        status,
        success: status >= 200 && status < 300,
        timestamp: new Date().toISOString()
      }
    });

    // Send aggregated metrics every 10 calls
    const calls = this.metrics.get(key)!;
    if (calls.length >= 10) {
      await this.sendAggregatedMetrics(endpoint, method, calls);
      this.metrics.set(key, []);
    }
  }

  private async sendAggregatedMetrics(endpoint: string, method: string, durations: number[]): Promise<void> {
    const sorted = durations.sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    await this.client.send({
      type: 'api.performance.aggregate',
      service: this.service,
      endpoint,
      method,
      metrics: {
        count: durations.length,
        mean: sum / durations.length,
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
        min: sorted[0],
        max: sorted[sorted.length - 1]
      },
      timestamp: new Date().toISOString()
    });
    
    console.log(`📈 Sent aggregated metrics for ${method} ${endpoint}`);
  }

  async trackDatabaseQuery(query: string, duration: number, rows: number): Promise<void> {
    await this.client.send({
      type: 'database.query',
      service: this.service,
      query: {
        type: this.getQueryType(query),
        duration,
        rows,
        slow: duration > 1000, // Mark as slow if > 1 second
        timestamp: new Date().toISOString()
      }
    });
  }

  private getQueryType(query: string): string {
    const normalized = query.trim().toUpperCase();
    if (normalized.startsWith('SELECT')) return 'SELECT';
    if (normalized.startsWith('INSERT')) return 'INSERT';
    if (normalized.startsWith('UPDATE')) return 'UPDATE';
    if (normalized.startsWith('DELETE')) return 'DELETE';
    return 'OTHER';
  }
}

/**
 * Demo: E-commerce flow
 */
async function demoEcommerceFlow() {
  console.log('\n🛍️  Demo: E-commerce Analytics Flow\n');
  
  const analytics = new EcommerceAnalytics(client);
  const userId = 'demo_user_123';

  // User views products
  await analytics.trackProductView({
    id: 'prod_001',
    name: 'Wireless Headphones',
    category: 'Electronics',
    price: 99.99,
    brand: 'TechBrand'
  }, userId);

  await analytics.trackProductView({
    id: 'prod_002',
    name: 'Laptop Stand',
    category: 'Accessories',
    price: 29.99
  }, userId);

  // User adds items to cart
  await analytics.trackAddToCart({
    id: 'prod_001',
    name: 'Wireless Headphones',
    price: 99.99,
    quantity: 1
  }, userId);

  await analytics.trackAddToCart({
    id: 'prod_002',
    name: 'Laptop Stand',
    price: 29.99,
    quantity: 2
  }, userId);

  // User starts checkout
  await analytics.trackCheckoutStarted(userId);

  // User completes purchase
  await analytics.trackPurchase({
    orderId: 'order_' + Date.now(),
    userId,
    items: [
      {
        productId: 'prod_001',
        name: 'Wireless Headphones',
        quantity: 1,
        price: 99.99
      },
      {
        productId: 'prod_002',
        name: 'Laptop Stand',
        quantity: 2,
        price: 29.99
      }
    ],
    total: 169.97,
    tax: 13.60,
    shipping: 10.00,
    paymentMethod: 'credit_card'
  });
}

/**
 * Demo: User behavior tracking
 */
async function demoUserBehavior() {
  console.log('\n👤 Demo: User Behavior Analytics\n');
  
  const sessionId = `demo_session_${Date.now()}`;
  const userId = 'demo_user_456';
  const analytics = new UserBehaviorAnalytics(client, sessionId, userId);

  // User navigates through site
  await analytics.trackPageView('/home', 'Home - My Site');
  await new Promise(r => setTimeout(r, 1000)); // Simulate time on page

  await analytics.trackPageView('/products', 'Products - My Site');
  
  // User interacts with elements
  await analytics.trackInteraction('filter', 'click', { category: 'electronics' });
  await analytics.trackInteraction('sort', 'change', 'price_low_high');

  // User performs search
  await analytics.trackSearch('wireless headphones', 15);

  // Track an error
  await analytics.trackError({
    message: 'Failed to load product image',
    type: 'network',
    context: { productId: 'prod_001' }
  });

  // Calculate and track engagement
  await analytics.trackEngagement(75, {
    timeOnSite: 80,
    pageDepth: 60,
    interactions: 85,
    searchUsage: 90
  });

  // End session
  await analytics.endSession();
}

/**
 * Demo: Performance monitoring
 */
async function demoPerformanceMonitoring() {
  console.log('\n⚡ Demo: Performance Monitoring\n');
  
  const monitor = new PerformanceMonitor(client, 'api-gateway');

  // Simulate API calls with varying performance
  const endpoints = ['/users', '/products', '/orders', '/search'];
  const methods = ['GET', 'POST', 'PUT', 'DELETE'];

  for (let i = 0; i < 25; i++) {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const method = methods[Math.floor(Math.random() * methods.length)];
    const duration = Math.floor(Math.random() * 500) + 50; // 50-550ms
    const status = Math.random() > 0.9 ? 500 : 200; // 10% error rate

    await monitor.trackAPICall(endpoint, method, duration, status);
    await new Promise(r => setTimeout(r, 100));
  }

  // Simulate database queries
  const queries = [
    'SELECT * FROM users WHERE id = ?',
    'INSERT INTO orders (user_id, total) VALUES (?, ?)',
    'UPDATE products SET stock = stock - ? WHERE id = ?'
  ];

  for (const query of queries) {
    const duration = Math.floor(Math.random() * 200) + 10;
    const rows = Math.floor(Math.random() * 100);
    await monitor.trackDatabaseQuery(query, duration, rows);
  }
}

/**
 * Main function to run all demos
 */
async function main() {
  console.log('📊 Nexus TypeScript Client - Analytics Tracking Examples\n');
  
  await demoEcommerceFlow();
  await demoUserBehavior();
  await demoPerformanceMonitoring();
  
  console.log('\n✨ All analytics examples completed!');
}

// Run the examples
if (require.main === module) {
  main().catch(console.error);
}

// Export classes for use in other modules
export {
  EcommerceAnalytics,
  UserBehaviorAnalytics,
  PerformanceMonitor
};