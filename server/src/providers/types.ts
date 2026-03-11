export type StreamInput = {
    message: string;
};

export type ProviderStreamOptions = {
    signal: AbortSignal;
};

export type Provider = {
    name: string;
    model: string;
    stream(input: StreamInput, options: ProviderStreamOptions): AsyncGenerator<string, void, void>;
};