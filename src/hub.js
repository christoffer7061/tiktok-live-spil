// Central event bus. Connections push events in, the game engine and the
// browser pages listen. Keeps the rest of the code decoupled.
import { EventEmitter } from 'node:events';

export class Hub extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.connectionStatus = { source: 'simulator', state: 'connected', detail: '' };
  }

  // Called by a connection module for every normalized event.
  push(event) {
    this.emit('event', event);
  }

  setConnectionStatus(status) {
    this.connectionStatus = { ...this.connectionStatus, ...status };
    this.emit('status', this.connectionStatus);
  }
}
