import { apiAuthorizeChannel } from '../api/client.ts';
import type { Stage1EventNotice } from '../api/types.ts';

export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'stale_reconnect' | 'denied';

interface PusherFrame {
  event: string;
  channel?: string;
  data?: unknown;
}

const DEFAULT_REVERB_KEY = 'ysp-stage1';

export class Stage1ReverbClient {
  private socket: WebSocket | null = null;
  private socketId: string | null = null;
  private userId: string | null = null;
  private chapterId: string | null = null;
  private generation = 0;
  private readonly seenEventIds = new Set<string>();
  private reconnectTimer: number | null = null;
  private intentionalClose = false;
  private subscribedChannels = new Set<string>();

  private readonly onStatus: (status: RealtimeStatus, detail?: string) => void;
  private readonly onNotice: (notice: Stage1EventNotice) => void;
  private readonly onResyncNeeded: () => void;

  constructor(options: {
    onStatus: (status: RealtimeStatus, detail?: string) => void;
    onNotice: (notice: Stage1EventNotice) => void;
    onResyncNeeded: () => void;
  }) {
    this.onStatus = options.onStatus;
    this.onNotice = options.onNotice;
    this.onResyncNeeded = options.onResyncNeeded;
  }

  connect(userId: string, chapterId: string | null): void {
    const contextChanged = this.userId !== userId || this.chapterId !== chapterId;
    if (!contextChanged && this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    this.generation += 1;
    const activeGen = this.generation;
    this.userId = userId;
    this.chapterId = chapterId;

    if (this.socket && this.socket.readyState <= WebSocket.OPEN && this.socketId && !this.intentionalClose) {
      void this.syncSubscriptions(activeGen);
      return;
    }

    this.teardownSocketOnly();
    this.intentionalClose = false;
    this.onStatus('connecting');

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const appKey = import.meta.env.VITE_REVERB_APP_KEY || DEFAULT_REVERB_KEY;
    const url = `${proto}//${window.location.host}/app/${encodeURIComponent(appKey)}?protocol=7&client=ysp-stage1&version=1.0`;

    try {
      const ws = new WebSocket(url);
      this.socket = ws;

      ws.onmessage = (event) => {
        if (activeGen !== this.generation || typeof event.data !== 'string') {
          return;
        }
        let frame: PusherFrame;
        try {
          frame = JSON.parse(event.data) as PusherFrame;
        } catch {
          return;
        }

        if (frame.event === 'pusher:connection_established') {
          const parsed = typeof frame.data === 'string' ? (JSON.parse(frame.data) as { socket_id?: string }) : (frame.data as { socket_id?: string });
          if (parsed?.socket_id) {
            this.socketId = parsed.socket_id;
            void this.syncSubscriptions(activeGen);
          }
          return;
        }

        if (frame.event === 'pusher:ping') {
          ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
          return;
        }

        if (frame.event === 'pusher_internal:subscription_succeeded') {
          this.onStatus('connected', frame.channel);
          return;
        }

        if (frame.event.startsWith('stage1.') && frame.event.endsWith('.changed.v1')) {
          const payload = typeof frame.data === 'string' ? (JSON.parse(frame.data) as Stage1EventNotice) : (frame.data as Stage1EventNotice);
          if (payload && payload.event_id && !this.seenEventIds.has(payload.event_id)) {
            this.seenEventIds.add(payload.event_id);
            if (this.seenEventIds.size > 500) {
              const first = this.seenEventIds.values().next().value;
              if (first) {
                this.seenEventIds.delete(first);
              }
            }
            this.onNotice(payload);
          }
        }
      };

      ws.onclose = () => {
        if (activeGen !== this.generation || this.intentionalClose) {
          return;
        }
        this.socketId = null;
        this.subscribedChannels.clear();
        this.onStatus('stale_reconnect', 'WebSocket closed; refreshing HTTP state before retry.');
        this.onResyncNeeded();
        if (this.reconnectTimer !== null) {
          window.clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = window.setTimeout(() => {
          if (activeGen === this.generation && this.userId) {
            this.connect(this.userId, this.chapterId);
          }
        }, 4000);
      };

      ws.onerror = () => {
        if (activeGen === this.generation) {
          this.onStatus('stale_reconnect', 'WebSocket transport error.');
        }
      };
    } catch {
      this.onStatus('stale_reconnect', 'WebSocket unavailable.');
    }
  }

  disconnect(): void {
    this.generation += 1;
    this.intentionalClose = true;
    this.userId = null;
    this.chapterId = null;
    this.seenEventIds.clear();
    this.teardownSocketOnly();
    this.onStatus('disconnected');
  }

  private teardownSocketOnly(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.subscribedChannels.clear();
    this.socketId = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore close failure
      }
      this.socket = null;
    }
  }

  private async syncSubscriptions(gen: number): Promise<void> {
    if (!this.socket || !this.socketId || !this.userId || gen !== this.generation) {
      return;
    }

    const desired: Array<{ channel: string; authUrl: string }> = [
      {
        channel: `private-stage1.user.${this.userId}`,
        authUrl: '/api/v1/auth/notification-subscriptions/authorize',
      },
    ];
    if (this.chapterId) {
      desired.push({
        channel: `private-stage1.chapter.${this.chapterId}.user.${this.userId}`,
        authUrl: `/api/v1/chapters/${encodeURIComponent(this.chapterId)}/notification-subscriptions/authorize`,
      });
    }

    const desiredNames = new Set(desired.map((d) => d.channel));
    for (const existing of Array.from(this.subscribedChannels)) {
      if (!desiredNames.has(existing) && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ event: 'pusher:unsubscribe', data: { channel: existing } }));
        this.subscribedChannels.delete(existing);
      }
    }

    for (const target of desired) {
      if (this.subscribedChannels.has(target.channel) || gen !== this.generation) {
        continue;
      }
      try {
        const auth = await apiAuthorizeChannel(target.authUrl, {
          socket_id: this.socketId,
          channel_name: target.channel,
        });
        if (gen !== this.generation || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
          return;
        }
        this.socket.send(
          JSON.stringify({
            event: 'pusher:subscribe',
            data: { auth, channel: target.channel },
          }),
        );
        this.subscribedChannels.add(target.channel);
      } catch {
        if (gen === this.generation) {
          this.onStatus('denied', `Channel denied: ${target.channel}`);
        }
      }
    }
  }
}
