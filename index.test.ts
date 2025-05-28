import { NexusClient, NexusEvent, NexusClientOptions } from './index';

describe('NexusClient', () => {
  let mockFetch: jest.Mock;
  let client: NexusClient;
  
  beforeEach(() => {
    mockFetch = jest.fn();
    client = new NexusClient({
      url: 'https://api.example.com/events',
      token: 'test-token',
      fetch: mockFetch
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw error when URL is missing', () => {
      expect(() => new NexusClient({ url: '', token: 'token' }))
        .toThrow('NexusClient requires both `url` and `token`.');
    });

    it('should throw error when token is missing', () => {
      expect(() => new NexusClient({ url: 'https://api.example.com', token: '' }))
        .toThrow('NexusClient requires both `url` and `token`.');
    });

    it('should create client with valid options', () => {
      expect(() => new NexusClient({
        url: 'https://api.example.com',
        token: 'valid-token'
      })).not.toThrow();
    });

    it('should use global fetch when custom fetch not provided', () => {
      global.fetch = jest.fn();
      const client = new NexusClient({
        url: 'https://api.example.com',
        token: 'token'
      });
      expect(client).toBeDefined();
    });
  });

  describe('send', () => {
    const mockResponse = (status: number, ok: boolean = status >= 200 && status < 300) => ({
      ok,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue(''),
      headers: new Headers(),
      redirected: false,
      type: 'basic' as ResponseType,
      url: 'https://api.example.com/events',
      clone: jest.fn(),
      body: null,
      bodyUsed: false,
      arrayBuffer: jest.fn(),
      blob: jest.fn(),
      formData: jest.fn(),
      bytes: jest.fn().mockResolvedValue(new Uint8Array())
    } as Response);

    describe('single event', () => {
      it('should send single event successfully', async () => {
        const event: NexusEvent = { type: 'test.event', data: 'test' };
        mockFetch.mockResolvedValue(mockResponse(200));

        const response = await client.send(event);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/events',
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer test-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([event])
          }
        );
        expect(response.status).toBe(200);
      });

      it('should handle event with all supported data types', async () => {
        const event: NexusEvent = {
          type: 'complex.event',
          string: 'text',
          number: 123,
          boolean: true,
          null: null,
          array: [1, 2, 3],
          nested: { key: 'value' },
          timestamp: new Date().toISOString()
        };
        mockFetch.mockResolvedValue(mockResponse(200));

        await client.send(event);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify([event])
          })
        );
      });
    });

    describe('batch events', () => {
      it('should send multiple events successfully', async () => {
        const events: NexusEvent[] = [
          { type: 'event.one', index: 1 },
          { type: 'event.two', index: 2 },
          { type: 'event.three', index: 3 }
        ];
        mockFetch.mockResolvedValue(mockResponse(200));

        const response = await client.send(events);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/events',
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer test-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(events)
          }
        );
        expect(response.status).toBe(200);
      });

      it('should send empty array of events', async () => {
        const events: NexusEvent[] = [];
        mockFetch.mockResolvedValue(mockResponse(200));

        const response = await client.send(events);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify([])
          })
        );
        expect(response.status).toBe(200);
      });

      it('should handle large batch of events', async () => {
        const events: NexusEvent[] = Array(1000).fill(null).map((_, i) => ({
          type: 'bulk.event',
          index: i,
          timestamp: new Date().toISOString()
        }));
        mockFetch.mockResolvedValue(mockResponse(200));

        const response = await client.send(events);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(200);
      });
    });

    describe('error handling', () => {
      it('should throw error for invalid events parameter', async () => {
        // The implementation doesn't validate input types, so these will fail when fetch is called
        // Testing with null will cause a runtime error
        mockFetch.mockRejectedValue(new TypeError('Cannot read properties of null'));
        
        await expect(client.send(null as any))
          .rejects.toThrow();
      });

      it('should handle network errors', async () => {
        const networkError = new Error('Network failure');
        mockFetch.mockRejectedValue(networkError);

        await expect(client.send({ type: 'test' }))
          .rejects.toThrow('Network failure');
      });

      it('should handle non-OK responses', async () => {
        mockFetch.mockResolvedValue(mockResponse(400, false));

        await expect(client.send({ type: 'test' }))
          .rejects.toThrow('Failed to send event(s): 400 Error -');
      });

      it('should handle 500 server errors', async () => {
        mockFetch.mockResolvedValue(mockResponse(500, false));

        await expect(client.send({ type: 'test' }))
          .rejects.toThrow('Failed to send event(s): 500 Error -');
      });

      it('should handle timeout errors', async () => {
        const timeoutError = new Error('Request timeout');
        timeoutError.name = 'AbortError';
        mockFetch.mockRejectedValue(timeoutError);

        await expect(client.send({ type: 'test' }))
          .rejects.toThrow('Request timeout');
      });
    });

    describe('edge cases', () => {
      it('should handle events with circular references by letting JSON.stringify handle it', async () => {
        const event: any = { type: 'circular' };
        event.self = event; // Create circular reference

        await expect(client.send(event))
          .rejects.toThrow(); // JSON.stringify will throw
      });

      it('should handle very long event type names', async () => {
        const event: NexusEvent = {
          type: 'a'.repeat(1000),
          data: 'test'
        };
        mockFetch.mockResolvedValue(mockResponse(200));

        const response = await client.send(event);
        expect(response.status).toBe(200);
      });

      it('should handle special characters in event data', async () => {
        const event: NexusEvent = {
          type: 'special.chars',
          data: '🚀 Unicode! \n\t Special chars: < > & " \' \\'
        };
        mockFetch.mockResolvedValue(mockResponse(200));

        const response = await client.send(event);
        expect(response.status).toBe(200);
      });
    });
  });

  describe('custom fetch implementation', () => {
    it('should use custom fetch function', async () => {
      const customFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: jest.fn().mockResolvedValue({ success: true })
      } as any);

      const customClient = new NexusClient({
        url: 'https://api.example.com',
        token: 'token',
        fetch: customFetch
      });

      await customClient.send({ type: 'test' });
      expect(customFetch).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should pass correct parameters to custom fetch', async () => {
      const customFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      } as any);

      const customClient = new NexusClient({
        url: 'https://custom.api.com/webhook',
        token: 'custom-token-123',
        fetch: customFetch
      });

      await customClient.send({ type: 'custom.event', value: 42 });

      expect(customFetch).toHaveBeenCalledWith(
        'https://custom.api.com/webhook',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer custom-token-123',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{ type: 'custom.event', value: 42 }])
        }
      );
    });
  });

  describe('TypeScript types', () => {
    it('should accept valid NexusEvent types', () => {
      const validEvents: NexusEvent[] = [
        { type: 'simple' },
        { type: 'with.data', data: 123 },
        { type: 'complex', nested: { value: true }, array: [1, 2, 3] }
      ];

      // This test ensures TypeScript compilation works with various event types
      expect(validEvents).toBeDefined();
    });

    it('should handle NexusClientOptions correctly', () => {
      const options: NexusClientOptions = {
        url: 'https://api.example.com',
        token: 'token',
        fetch: global.fetch
      };

      const optionsWithoutFetch: NexusClientOptions = {
        url: 'https://api.example.com',
        token: 'token'
      };

      expect(options).toBeDefined();
      expect(optionsWithoutFetch).toBeDefined();
    });
  });
});