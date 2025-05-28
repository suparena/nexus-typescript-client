/**
 * Custom Fetch Implementation Example for Nexus TypeScript Client
 * 
 * This example demonstrates how to use custom fetch implementations for
 * different environments, HTTP clients, and advanced networking features.
 */

import { NexusClient } from '../index';

/**
 * Example 1: Custom fetch with request/response logging
 */
function createLoggingFetch(): typeof fetch {
  return async (url, options) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    console.log(`📤 [${requestId}] Request to ${url}`);
    console.log(`   Method: ${options?.method || 'GET'}`);
    console.log(`   Headers: ${JSON.stringify(options?.headers)}`);
    if (options?.body) {
      console.log(`   Body: ${options.body}`);
    }
    
    try {
      const response = await fetch(url, options);
      const duration = Date.now() - startTime;
      
      console.log(`📥 [${requestId}] Response from ${url}`);
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Duration: ${duration}ms`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [${requestId}] Error from ${url}`);
      console.error(`   Duration: ${duration}ms`);
      console.error(`   Error: ${error}`);
      throw error;
    }
  };
}

/**
 * Example 2: Custom fetch with timeout support
 */
function createTimeoutFetch(timeoutMs = 30000): typeof fetch {
  return async (url, options) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  };
}

/**
 * Example 3: Custom fetch with retry logic built-in
 */
function createRetryFetch(maxRetries = 3, retryDelay = 1000): typeof fetch {
  return async (url, options) => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        
        // Only retry on 5xx errors or network failures
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }
        
        return response;
      } catch (error: any) {
        lastError = error;
        console.log(`🔄 Retry ${attempt}/${maxRetries} after error: ${error.message}`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }
    
    throw lastError || new Error('All retries failed');
  };
}

/**
 * Example 4: Custom fetch with compression support
 */
function createCompressionFetch(): typeof fetch {
  return async (url, options) => {
    // Add compression headers
    const headers = new Headers(options?.headers);
    headers.set('Accept-Encoding', 'gzip, deflate, br');
    
    // For request body compression (if supported by server)
    if (options?.body && typeof options.body === 'string') {
      // In a real implementation, you would compress the body here
      // For demo purposes, we'll just add the header
      headers.set('Content-Encoding', 'gzip');
    }
    
    return fetch(url, {
      ...options,
      headers
    });
  };
}

/**
 * Example 5: Custom fetch with caching
 */
class CachingFetch {
  private cache = new Map<string, { response: Response; expires: number }>();
  private cacheDuration: number;

  constructor(cacheDurationMs = 60000) { // 1 minute default
    this.cacheDuration = cacheDurationMs;
  }

  fetch: typeof fetch = async (url, options) => {
    const method = options?.method || 'GET';
    
    // Only cache GET requests
    if (method !== 'GET') {
      return fetch(url, options);
    }
    
    const cacheKey = `${method}:${url}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      console.log(`📦 Cache hit for ${url}`);
      return cached.response.clone();
    }
    
    console.log(`🔍 Cache miss for ${url}`);
    const response = await fetch(url, options);
    
    // Only cache successful responses
    if (response.ok) {
      this.cache.set(cacheKey, {
        response: response.clone(),
        expires: Date.now() + this.cacheDuration
      });
    }
    
    return response;
  };

  clearCache() {
    this.cache.clear();
    console.log('🧹 Cache cleared');
  }
}

/**
 * Example 6: Custom fetch with metrics collection
 */
class MetricsFetch {
  private metrics: Array<{
    url: string;
    method: string;
    status: number;
    duration: number;
    timestamp: Date;
    error?: string;
  }> = [];

  fetch: typeof fetch = async (url, options) => {
    const startTime = Date.now();
    const method = options?.method || 'GET';
    
    try {
      const response = await fetch(url, options);
      const duration = Date.now() - startTime;
      
      this.metrics.push({
        url: url.toString(),
        method,
        status: response.status,
        duration,
        timestamp: new Date()
      });
      
      return response;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.metrics.push({
        url: url.toString(),
        method,
        status: 0,
        duration,
        timestamp: new Date(),
        error: error.message
      });
      
      throw error;
    }
  };

  getMetrics() {
    return {
      totalRequests: this.metrics.length,
      successfulRequests: this.metrics.filter(m => m.status >= 200 && m.status < 300).length,
      failedRequests: this.metrics.filter(m => m.status === 0 || m.status >= 400).length,
      averageDuration: this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length || 0,
      requests: this.metrics
    };
  }

  printReport() {
    const stats = this.getMetrics();
    console.log('\n📊 Fetch Metrics Report:');
    console.log(`   Total requests: ${stats.totalRequests}`);
    console.log(`   Successful: ${stats.successfulRequests}`);
    console.log(`   Failed: ${stats.failedRequests}`);
    console.log(`   Average duration: ${stats.averageDuration.toFixed(2)}ms`);
    console.log(`   Success rate: ${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%`);
  }
}

/**
 * Example 7: Proxy configuration for different environments
 */
function createProxyFetch(proxyUrl: string): typeof fetch {
  // Note: This is a simplified example. In Node.js, you'd typically use
  // an HTTP agent with proxy support. This shows the pattern.
  return async (url, options) => {
    console.log(`🔀 Proxying request through ${proxyUrl}`);
    
    // In a real implementation, you would:
    // 1. Parse the proxy URL
    // 2. Establish connection to proxy
    // 3. Send CONNECT request for HTTPS
    // 4. Forward the actual request
    
    // For this demo, we'll just add a header
    const headers = new Headers(options?.headers);
    headers.set('X-Forwarded-For', 'client-ip');
    headers.set('X-Proxy-Authorization', 'Bearer proxy-token');
    
    return fetch(url, {
      ...options,
      headers
    });
  };
}

/**
 * Example 8: Using custom fetch implementations
 */
async function demonstrateCustomFetch() {
  console.log('🔧 Demonstrating Custom Fetch Implementations\n');
  
  // 1. Logging fetch
  console.log('1️⃣ Using Logging Fetch:');
  const loggingClient = new NexusClient({
    url: 'https://api.example.com/events',
    token: 'test-token',
    fetch: createLoggingFetch()
  });
  
  try {
    await loggingClient.send({
      type: 'test.event',
      message: 'Testing logging fetch'
    });
  } catch (error) {
    // Expected to fail with example URL
  }
  
  // 2. Timeout fetch
  console.log('\n2️⃣ Using Timeout Fetch (5 seconds):');
  const timeoutClient = new NexusClient({
    url: 'https://api.example.com/events',
    token: 'test-token',
    fetch: createTimeoutFetch(5000)
  });
  
  // 3. Retry fetch
  console.log('\n3️⃣ Using Retry Fetch:');
  const retryClient = new NexusClient({
    url: 'https://api.example.com/events',
    token: 'test-token',
    fetch: createRetryFetch(3, 1000)
  });
  
  // 4. Caching fetch
  console.log('\n4️⃣ Using Caching Fetch:');
  const cachingFetch = new CachingFetch(60000);
  const cachingClient = new NexusClient({
    url: 'https://api.example.com/events',
    token: 'test-token',
    fetch: cachingFetch.fetch
  });
  
  // 5. Metrics fetch
  console.log('\n5️⃣ Using Metrics Fetch:');
  const metricsFetch = new MetricsFetch();
  const metricsClient = new NexusClient({
    url: 'https://api.example.com/events',
    token: 'test-token',
    fetch: metricsFetch.fetch
  });
  
  // Send some events to collect metrics
  for (let i = 0; i < 5; i++) {
    try {
      await metricsClient.send({
        type: 'metric.test',
        index: i
      });
    } catch (error) {
      // Expected to fail
    }
  }
  
  metricsFetch.printReport();
}

/**
 * Example 9: Combining multiple fetch behaviors
 */
function createAdvancedFetch(): typeof fetch {
  const metricsFetch = new MetricsFetch();
  const cachingFetch = new CachingFetch();
  
  return async (url, options) => {
    // Apply multiple behaviors in order
    const loggingFetch = createLoggingFetch();
    const timeoutFetch = createTimeoutFetch(30000);
    const retryFetch = createRetryFetch(3, 1000);
    
    // Compose the fetch functions
    const composedFetch: typeof fetch = async (url, options) => {
      // First apply caching
      const cachedResponse = await cachingFetch.fetch(url, options);
      if (cachedResponse.headers.get('X-From-Cache')) {
        return cachedResponse;
      }
      
      // Then apply timeout and retry
      return retryFetch(url, options);
    };
    
    // Wrap with logging and metrics
    const startTime = Date.now();
    try {
      console.log(`🚀 Advanced fetch to ${url}`);
      const response = await composedFetch(url, options);
      console.log(`✅ Completed in ${Date.now() - startTime}ms`);
      return response;
    } catch (error) {
      console.error(`❌ Failed after ${Date.now() - startTime}ms`);
      throw error;
    }
  };
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('🎨 Nexus TypeScript Client - Custom Fetch Examples\n');
  
  await demonstrateCustomFetch();
  
  console.log('\n✨ All custom fetch examples completed!');
}

// Run the examples
if (require.main === module) {
  main().catch(console.error);
}

// Export utilities for use in other modules
export {
  createLoggingFetch,
  createTimeoutFetch,
  createRetryFetch,
  createCompressionFetch,
  CachingFetch,
  MetricsFetch,
  createProxyFetch,
  createAdvancedFetch
};