// The goal-light burst when an owner calls a side: small slabs in the club's colours fly off its logo, fall and fade.
// One fixed canvas over the viewport is made for the burst and removed once the last spark is gone, so nothing keeps
// drawing between picks.

interface Spark { x: number; y: number; vx: number; vy: number; life: number; span: number; w: number; h: number; turn: number; spin: number; colour: string }

const GRAVITY = 1500;
let canvas: HTMLCanvasElement | null = null;
let sparks: Spark[] = [];
let frame = 0;
let last = 0;

function open() {
    if (canvas) return canvas;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '60', pointerEvents: 'none' });
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * scale;
    canvas.height = window.innerHeight * scale;
    canvas.getContext('2d')!.setTransform(scale, 0, 0, scale, 0, 0);
    document.body.append(canvas);
    return canvas;
}

function step(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const context = canvas!.getContext('2d')!;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    sparks = sparks.filter(spark => (spark.life += dt) < spark.span);
    for (const spark of sparks) {
        spark.vy += GRAVITY * dt;
        spark.vx *= 1 - 1.8 * dt;
        spark.vy *= 1 - .6 * dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.turn += spark.spin * dt;
        const age = spark.life / spark.span;
        context.save();
        context.translate(spark.x, spark.y);
        context.rotate(spark.turn);
        context.globalAlpha = 1 - age * age;
        context.fillStyle = spark.colour;
        // a tiny parallelogram slab, cut on the house slant
        const { w, h } = spark, cut = h / 2;
        context.beginPath();
        context.moveTo(-w / 2 + cut, -h / 2);
        context.lineTo(w / 2, -h / 2);
        context.lineTo(w / 2 - cut, h / 2);
        context.lineTo(-w / 2, h / 2);
        context.closePath();
        context.fill();
        context.restore();
    }
    if (sparks.length) { frame = requestAnimationFrame(step); return; }
    frame = 0;
    canvas!.remove();
    canvas = null;
}

/** Fire a burst from a viewport point; `lean` tilts it toward a side (-1 left, 1 right), `size` scales the count */
export function burst(x: number, y: number, colours: string[], lean: number, size = 44) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    open();
    const count = Math.round(window.innerWidth <= 640 ? size * .7 : size);
    for (let n = 0; n < count; n++) {
        const angle = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.35 + lean * .25;
        const speed = 240 + Math.random() * 520;
        sparks.push({
            x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0, span: .65 + Math.random() * .5,
            w: 6 + Math.random() * 8, h: 3 + Math.random() * 3, turn: Math.random() * 6, spin: (Math.random() - .5) * 16,
            colour: colours[n % colours.length],
        });
    }
    if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); }
}
