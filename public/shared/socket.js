// WebSocket client that reconnects by itself when the server restarts.
export function connect(role, { onMessage, onOpen, onClose } = {}) {
  let ws;
  let retry = 500;
  const api = {
    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };

  function open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?role=${role}`);
    ws.onopen = () => { retry = 500; onOpen?.(); };
    ws.onmessage = (e) => {
      try { onMessage?.(JSON.parse(e.data)); } catch (err) { console.error(err); }
    };
    ws.onclose = () => {
      onClose?.();
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 5000); // back off up to 5 s
    };
  }
  open();
  return api;
}
