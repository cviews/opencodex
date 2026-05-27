import {
  createOpencodeClient,
  type OpencodeClient,
} from '@opencode-ai/sdk/v2/client';

type EventStreamResult = Awaited<
  ReturnType<NonNullable<OpencodeClient>['event']['subscribe']>
>;

let client: OpencodeClient | null = null;
let eventStream: EventStreamResult | null = null;
let abortController: AbortController | null = null;

export function initClient(baseUrl: string): OpencodeClient {
  client = createOpencodeClient({ baseUrl });
  return client;
}

export function getClient(): OpencodeClient | null {
  return client;
}

export async function subscribeToEvents(
  onEvent?: (event: unknown) => void,
  onError?: (error: unknown) => void,
): Promise<EventStreamResult | null> {
  if (!client) return null;

  abortController = new AbortController();

  const result = await client.event.subscribe(
    {},
    {
      signal: abortController.signal,
      onSseEvent: onEvent
        ? (event) => {
            onEvent(event.data);
          }
        : undefined,
      onSseError: onError,
    },
  );

  eventStream = result;
  return result;
}

export function getEventStream(): EventStreamResult | null {
  return eventStream;
}

export function disposeEventStream(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  eventStream = null;
}

export function disposeClient(): void {
  disposeEventStream();
  client = null;
}
