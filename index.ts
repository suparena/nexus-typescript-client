export interface NexusEvent {
    type: string;
    [key: string]: any;
}

export interface NexusClientOptions {
    url: string;
    token: string;
    fetch?: typeof fetch;
}

export class NexusClient {
    private readonly url: string;
    private readonly token: string;
    private readonly fetchFn: typeof fetch;

    constructor(options: NexusClientOptions) {
        this.url = options.url;
        this.token = options.token;
        this.fetchFn = options.fetch || fetch;

        if (!this.url || !this.token) {
            throw new Error("NexusClient requires both `url` and `token`.");
        }
    }

    async send(events: NexusEvent | NexusEvent[]): Promise<Response> {
        const payload = Array.isArray(events) ? events : [events];

        const response = await this.fetchFn(this.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to send event(s): ${response.status} ${response.statusText} - ${errorBody}`);
        }

        return response;
    }
}