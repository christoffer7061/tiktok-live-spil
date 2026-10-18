// Small canvas confetti effect for the winner screen.
const COLORS = ['#ff2d75', '#25f4ee', '#ffd23f', '#3ddc84', '#ffffff', '#a66bff'];

export class Confetti {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pieces = [];
    this.running = false;
  }

  start() {
    const { width } = this.canvas;
    this.pieces = Array.from({ length: 220 }, () => ({
      x: Math.random() * width,
      y: -Math.random() * 900,
      w: 14 + Math.random() * 14,
      h: 8 + Math.random() * 10,
      vy: 6 + Math.random() * 8,
      vx: -3 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(() => this.#frame());
    }
  }

  stop() {
    this.running = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  #frame() {
    if (!this.running) return;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of this.pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > canvas.height + 40) { p.y = -40; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(() => this.#frame());
  }
}
