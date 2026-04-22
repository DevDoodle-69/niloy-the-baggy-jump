import { useEffect, useRef, useState, useCallback } from "react";
import playerImg from "@assets/Picsart_26-04-22_22-07-58-568_1776874889373.png";
import jeansImg from "@assets/Picsart_26-04-22_22-16-38-121_1776874882176.png";

type GameState = "intro" | "menu" | "playing" | "gameover";

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  type: "spike" | "rock" | "saw";
  rot: number;
}

interface Collectible {
  x: number;
  y: number;
  w: number;
  h: number;
  collected: boolean;
  bob: number;
  rot: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  size: number;
}

interface Building {
  x: number;
  w: number;
  h: number;
  color: string;
}

const GRAVITY = 0.7;
const JUMP_VELOCITY = -15.5;
const GROUND_Y = 0.82; // ratio of canvas height
const PLAYER_W = 70;
const PLAYER_H = 110;
const SCROLL_SPEED_BASE = 5;

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>("intro");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const stored = localStorage.getItem("baggyAmarHigh");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [collected, setCollected] = useState(0);

  // Mutable game refs
  const stateRef = useRef({
    player: {
      x: 140,
      y: 0,
      vy: 0,
      onGround: true,
      doubleJumped: false,
      climbing: false,
      tilt: 0,
    },
    obstacles: [] as Obstacle[],
    collectibles: [] as Collectible[],
    particles: [] as Particle[],
    clouds: [] as Cloud[],
    buildings: [] as Building[],
    scroll: 0,
    speed: SCROLL_SPEED_BASE,
    spawnTimer: 0,
    collectTimer: 0,
    score: 0,
    collected: 0,
    frame: 0,
    bgOffset: 0,
    shake: 0,
    flash: 0,
    runFrame: 0,
  });

  const playerImgRef = useRef<HTMLImageElement | null>(null);
  const jeansImgRef = useRef<HTMLImageElement | null>(null);

  // Load images
  useEffect(() => {
    const p = new Image();
    p.src = playerImg;
    p.onload = () => { playerImgRef.current = p; };
    const j = new Image();
    j.src = jeansImg;
    j.onload = () => { jeansImgRef.current = j; };
  }, []);

  // Audio context for sound effects
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playSound = useCallback((type: "jump" | "collect" | "hit" | "start") => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      if (type === "jump") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === "collect") {
        [880, 1320, 1760].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(f, now + i * 0.04);
          gain.gain.setValueAtTime(0.15, now + i * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.04 + 0.12);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + i * 0.04);
          osc.stop(now + i * 0.04 + 0.12);
        });
      } else if (type === "hit") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === "start") {
        [523, 659, 784, 1047].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(f, now + i * 0.08);
          gain.gain.setValueAtTime(0.15, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.2);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.2);
        });
      }
    } catch (e) {
      // ignore audio errors
    }
  }, []);

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const groundY = canvas.height * GROUND_Y;
    const s = stateRef.current;
    s.player = {
      x: 140,
      y: groundY - PLAYER_H,
      vy: 0,
      onGround: true,
      doubleJumped: false,
      climbing: false,
      tilt: 0,
    };
    s.obstacles = [];
    s.collectibles = [];
    s.particles = [];
    s.scroll = 0;
    s.speed = SCROLL_SPEED_BASE;
    s.spawnTimer = 0;
    s.collectTimer = 0;
    s.score = 0;
    s.collected = 0;
    s.frame = 0;
    s.shake = 0;
    s.flash = 0;
    setScore(0);
    setCollected(0);

    // Init clouds
    s.clouds = [];
    for (let i = 0; i < 8; i++) {
      s.clouds.push({
        x: Math.random() * canvas.width,
        y: 30 + Math.random() * (canvas.height * 0.35),
        speed: 0.3 + Math.random() * 0.7,
        size: 30 + Math.random() * 60,
      });
    }
    // Init buildings (parallax)
    s.buildings = [];
    let bx = 0;
    while (bx < canvas.width + 200) {
      const w = 80 + Math.random() * 120;
      const h = 140 + Math.random() * 220;
      s.buildings.push({
        x: bx,
        w,
        h,
        color: ["#1a1233", "#241845", "#2d1b54", "#1f1340"][Math.floor(Math.random() * 4)],
      });
      bx += w + 8;
    }
  }, []);

  const startGame = useCallback(() => {
    playSound("start");
    setGameState("playing");
    setTimeout(() => resetGame(), 0);
  }, [playSound, resetGame]);

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (s.player.onGround) {
      s.player.vy = JUMP_VELOCITY;
      s.player.onGround = false;
      s.player.doubleJumped = false;
      playSound("jump");
      // dust particles
      for (let i = 0; i < 8; i++) {
        s.particles.push({
          x: s.player.x + PLAYER_W / 2,
          y: s.player.y + PLAYER_H,
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 3,
          life: 25,
          maxLife: 25,
          color: "#c9a87a",
          size: 3 + Math.random() * 3,
        });
      }
    } else if (!s.player.doubleJumped) {
      s.player.vy = JUMP_VELOCITY * 0.85;
      s.player.doubleJumped = true;
      s.player.climbing = true;
      playSound("jump");
      // climbing sparkles
      for (let i = 0; i < 12; i++) {
        s.particles.push({
          x: s.player.x + PLAYER_W / 2,
          y: s.player.y + PLAYER_H / 2,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          life: 30,
          maxLife: 30,
          color: ["#ffd700", "#ff00aa", "#00ffff"][Math.floor(Math.random() * 3)],
          size: 2 + Math.random() * 3,
        });
      }
    }
  }, [playSound]);

  // Input handling
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        if (gameState === "playing") jump();
        else if (gameState === "menu" || gameState === "gameover") startGame();
        else if (gameState === "intro") setGameState("menu");
      } else if (e.code === "Enter") {
        if (gameState === "menu" || gameState === "gameover") startGame();
        else if (gameState === "intro") setGameState("menu");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [gameState, jump, startGame]);

  // Resize canvas
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auto-advance intro
  useEffect(() => {
    if (gameState === "intro") {
      const t = setTimeout(() => setGameState("menu"), 4500);
      return () => clearTimeout(t);
    }
  }, [gameState]);

  // Game loop
  useEffect(() => {
    if (gameState !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const loop = () => {
      const s = stateRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const groundY = H * GROUND_Y;

      s.frame++;
      s.runFrame = (s.runFrame + 0.3) % 4;

      // Difficulty ramp
      s.speed = SCROLL_SPEED_BASE + Math.min(7, s.score / 250);

      // Update player physics
      s.player.vy += GRAVITY;
      s.player.y += s.player.vy;
      if (s.player.y >= groundY - PLAYER_H) {
        s.player.y = groundY - PLAYER_H;
        s.player.vy = 0;
        s.player.onGround = true;
        s.player.doubleJumped = false;
        s.player.climbing = false;
      }
      s.player.tilt = s.player.vy * 0.02;

      // Spawn obstacles
      s.spawnTimer--;
      if (s.spawnTimer <= 0) {
        const types: Obstacle["type"][] = ["spike", "rock", "saw"];
        const type = types[Math.floor(Math.random() * types.length)];
        const w = type === "saw" ? 60 : type === "rock" ? 70 : 50;
        const h = type === "saw" ? 60 : type === "rock" ? 70 : 60;
        const yOffset = type === "saw" && Math.random() < 0.3 ? -90 : 0;
        s.obstacles.push({
          x: W + 40,
          y: groundY - h + yOffset,
          w,
          h,
          type,
          rot: 0,
        });
        s.spawnTimer = Math.max(45, 110 - s.score / 25);
      }

      // Spawn collectibles
      s.collectTimer--;
      if (s.collectTimer <= 0) {
        const w = 56;
        const h = 80;
        const heightTier = Math.floor(Math.random() * 3);
        const yPos = heightTier === 0
          ? groundY - h - 20
          : heightTier === 1
            ? groundY - h - 130
            : groundY - h - 220;
        s.collectibles.push({
          x: W + 40 + Math.random() * 200,
          y: yPos,
          w,
          h,
          collected: false,
          bob: Math.random() * Math.PI * 2,
          rot: 0,
        });
        s.collectTimer = 70 + Math.random() * 50;
      }

      // Move and update obstacles
      s.obstacles = s.obstacles.filter((o) => {
        o.x -= s.speed;
        if (o.type === "saw") o.rot += 0.3;
        return o.x > -100;
      });

      // Move collectibles
      s.collectibles = s.collectibles.filter((c) => {
        c.x -= s.speed;
        c.bob += 0.1;
        c.rot += 0.05;
        return c.x > -100 && !c.collected;
      });

      // Collisions
      const px = s.player.x + 12;
      const py = s.player.y + 10;
      const pw = PLAYER_W - 24;
      const ph = PLAYER_H - 16;

      for (const o of s.obstacles) {
        const ox = o.x + 6;
        const oy = o.y + 6;
        const ow = o.w - 12;
        const oh = o.h - 12;
        if (px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy) {
          // hit
          playSound("hit");
          s.shake = 20;
          s.flash = 1;
          // explosion particles
          for (let i = 0; i < 30; i++) {
            s.particles.push({
              x: s.player.x + PLAYER_W / 2,
              y: s.player.y + PLAYER_H / 2,
              vx: (Math.random() - 0.5) * 12,
              vy: (Math.random() - 0.5) * 12,
              life: 50,
              maxLife: 50,
              color: ["#ff4444", "#ff8800", "#ffd700"][Math.floor(Math.random() * 3)],
              size: 3 + Math.random() * 5,
            });
          }
          // Update high score and end
          const finalScore = Math.floor(s.score);
          if (finalScore > highScore) {
            setHighScore(finalScore);
            localStorage.setItem("baggyAmarHigh", finalScore.toString());
          }
          setScore(finalScore);
          setCollected(s.collected);
          setTimeout(() => setGameState("gameover"), 600);
          return;
        }
      }

      for (const c of s.collectibles) {
        if (c.collected) continue;
        if (px < c.x + c.w && px + pw > c.x && py < c.y + c.h && py + ph > c.y) {
          c.collected = true;
          s.collected++;
          s.score += 50;
          playSound("collect");
          for (let i = 0; i < 16; i++) {
            s.particles.push({
              x: c.x + c.w / 2,
              y: c.y + c.h / 2,
              vx: (Math.random() - 0.5) * 8,
              vy: (Math.random() - 0.5) * 8 - 2,
              life: 40,
              maxLife: 40,
              color: ["#ffd700", "#00ffff", "#ff00aa", "#ffffff"][Math.floor(Math.random() * 4)],
              size: 2 + Math.random() * 4,
            });
          }
        }
      }

      // Score over time
      s.score += 0.2;

      // Update particles
      s.particles = s.particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life--;
        return p.life > 0;
      });

      // Update clouds
      for (const c of s.clouds) {
        c.x -= c.speed;
        if (c.x < -c.size * 2) {
          c.x = W + c.size;
          c.y = 30 + Math.random() * (H * 0.35);
        }
      }

      // Update buildings (parallax)
      for (const b of s.buildings) {
        b.x -= s.speed * 0.3;
      }
      while (s.buildings.length && s.buildings[0].x + s.buildings[0].w < 0) {
        s.buildings.shift();
      }
      let lastX = s.buildings.length ? s.buildings[s.buildings.length - 1].x + s.buildings[s.buildings.length - 1].w : 0;
      while (lastX < W + 200) {
        const w = 80 + Math.random() * 120;
        const h = 140 + Math.random() * 220;
        s.buildings.push({
          x: lastX + 8,
          w,
          h,
          color: ["#1a1233", "#241845", "#2d1b54", "#1f1340"][Math.floor(Math.random() * 4)],
        });
        lastX += w + 8;
      }

      s.bgOffset = (s.bgOffset + s.speed * 0.5) % W;

      // === RENDER ===
      // Sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#1a0b3d");
      grad.addColorStop(0.4, "#3d1259");
      grad.addColorStop(0.7, "#7a1f5e");
      grad.addColorStop(1, "#ff6b35");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Sun / moon
      ctx.save();
      ctx.fillStyle = "#ffd76b";
      ctx.shadowColor = "#ffaa00";
      ctx.shadowBlur = 60;
      ctx.beginPath();
      ctx.arc(W * 0.78, H * 0.32, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Stars
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 50; i++) {
        const sx = (i * 137 + s.frame * 0.1) % W;
        const sy = (i * 73) % (H * 0.4);
        const tw = 0.5 + 0.5 * Math.sin(s.frame * 0.05 + i);
        ctx.globalAlpha = tw;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;

      // Apply screen shake
      ctx.save();
      if (s.shake > 0) {
        ctx.translate(
          (Math.random() - 0.5) * s.shake,
          (Math.random() - 0.5) * s.shake,
        );
        s.shake *= 0.85;
      }

      // Clouds
      for (const c of s.clouds) {
        ctx.fillStyle = "rgba(255, 200, 230, 0.4)";
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.size * 0.5, 0, Math.PI * 2);
        ctx.arc(c.x + c.size * 0.4, c.y, c.size * 0.4, 0, Math.PI * 2);
        ctx.arc(c.x - c.size * 0.4, c.y, c.size * 0.45, 0, Math.PI * 2);
        ctx.arc(c.x + c.size * 0.2, c.y - c.size * 0.2, c.size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // Buildings
      for (const b of s.buildings) {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, groundY - b.h, b.w, b.h);
        // windows
        ctx.fillStyle = "rgba(255, 220, 100, 0.6)";
        for (let wy = groundY - b.h + 20; wy < groundY - 30; wy += 24) {
          for (let wx = b.x + 10; wx < b.x + b.w - 14; wx += 20) {
            if ((Math.floor(wx + wy) % 3) !== 0) {
              ctx.fillRect(wx, wy, 8, 12);
            }
          }
        }
        // roof outline
        ctx.fillStyle = "rgba(255, 0, 170, 0.4)";
        ctx.fillRect(b.x, groundY - b.h, b.w, 3);
      }

      // Ground
      const groundGrad = ctx.createLinearGradient(0, groundY, 0, H);
      groundGrad.addColorStop(0, "#2a1a4a");
      groundGrad.addColorStop(1, "#0a0518");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, groundY, W, H - groundY);

      // Ground stripes (movement indicator)
      ctx.fillStyle = "rgba(255, 215, 0, 0.5)";
      const stripeOffset = -(s.scroll % 80);
      s.scroll += s.speed;
      for (let x = stripeOffset; x < W; x += 80) {
        ctx.fillRect(x, groundY + 8, 40, 4);
      }

      // Ground neon line
      ctx.strokeStyle = "#ff00aa";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#ff00aa";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(W, groundY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Collectibles (baggy jeans)
      for (const c of s.collectibles) {
        const bobY = Math.sin(c.bob) * 6;
        ctx.save();
        ctx.translate(c.x + c.w / 2, c.y + c.h / 2 + bobY);
        ctx.rotate(Math.sin(c.rot) * 0.15);
        // glow
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 25;
        if (jeansImgRef.current) {
          ctx.drawImage(jeansImgRef.current, -c.w / 2, -c.h / 2, c.w, c.h);
        } else {
          ctx.fillStyle = "#3a6da8";
          ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        }
        ctx.restore();
        // sparkle
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        const sparkSize = 3 + Math.sin(s.frame * 0.2 + c.bob) * 2;
        ctx.fillRect(c.x + c.w - 8, c.y + 4 + bobY, sparkSize, sparkSize);
      }

      // Obstacles
      for (const o of s.obstacles) {
        if (o.type === "spike") {
          ctx.fillStyle = "#ff2266";
          ctx.shadowColor = "#ff0044";
          ctx.shadowBlur = 15;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const sx = o.x + i * (o.w / 3);
            ctx.moveTo(sx, o.y + o.h);
            ctx.lineTo(sx + o.w / 6, o.y);
            ctx.lineTo(sx + o.w / 3, o.y + o.h);
          }
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (o.type === "rock") {
          ctx.fillStyle = "#5a3a2a";
          ctx.strokeStyle = "#2a1a0a";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#7a5a4a";
          ctx.beginPath();
          ctx.ellipse(o.x + o.w / 2 - 8, o.y + o.h / 2 - 8, 8, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.type === "saw") {
          ctx.save();
          ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
          ctx.rotate(o.rot);
          ctx.shadowColor = "#00ffff";
          ctx.shadowBlur = 20;
          ctx.fillStyle = "#cccccc";
          const r = o.w / 2;
          ctx.beginPath();
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const rr = i % 2 === 0 ? r : r * 0.7;
            const xx = Math.cos(a) * rr;
            const yy = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#444";
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Player
      ctx.save();
      ctx.translate(s.player.x + PLAYER_W / 2, s.player.y + PLAYER_H / 2);
      ctx.rotate(s.player.tilt);
      // climbing aura
      if (s.player.climbing) {
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 30;
      } else {
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 8;
      }
      // small bob when running
      const runBob = s.player.onGround ? Math.sin(s.runFrame * Math.PI) * 2 : 0;
      if (playerImgRef.current) {
        ctx.drawImage(playerImgRef.current, -PLAYER_W / 2, -PLAYER_H / 2 + runBob, PLAYER_W, PLAYER_H);
      } else {
        ctx.fillStyle = "#222";
        ctx.fillRect(-PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H);
      }
      ctx.restore();

      // shadow under player
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      const shadowScale = Math.max(0.4, 1 - (groundY - s.player.y - PLAYER_H) / 300);
      ctx.ellipse(s.player.x + PLAYER_W / 2, groundY + 4, PLAYER_W * 0.4 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Particles
      for (const p of s.particles) {
        const alpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      ctx.restore(); // shake

      // Flash overlay
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.flash})`;
        ctx.fillRect(0, 0, W, H);
        s.flash *= 0.85;
      }

      // HUD - update React state occasionally
      if (s.frame % 10 === 0) {
        setScore(Math.floor(s.score));
        setCollected(s.collected);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [gameState, playSound, highScore]);

  // Initialize on first canvas mount for menu/intro background visuals
  useEffect(() => {
    if (gameState === "menu" || gameState === "gameover") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let raf = 0;
      let f = 0;
      const draw = () => {
        f++;
        const W = canvas.width;
        const H = canvas.height;
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "#1a0b3d");
        grad.addColorStop(0.5, "#5d1259");
        grad.addColorStop(1, "#ff6b35");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        // grid floor
        ctx.strokeStyle = "rgba(255, 0, 170, 0.5)";
        ctx.lineWidth = 2;
        const horizon = H * 0.65;
        for (let i = 0; i < 20; i++) {
          const y = horizon + (i * i * 4) - (f * 2) % (i * 8 + 8);
          if (y < H && y > horizon) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
          }
        }
        for (let i = -10; i < 10; i++) {
          ctx.beginPath();
          ctx.moveTo(W / 2, horizon);
          ctx.lineTo(W / 2 + i * 200, H);
          ctx.stroke();
        }
        // sun
        const sunGrad = ctx.createLinearGradient(0, horizon - 200, 0, horizon);
        sunGrad.addColorStop(0, "#ffd76b");
        sunGrad.addColorStop(1, "#ff2266");
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(W / 2, horizon, 150, Math.PI, 0);
        ctx.fill();
        // sun stripes
        ctx.fillStyle = "#1a0b3d";
        for (let i = 0; i < 5; i++) {
          ctx.fillRect(W / 2 - 150, horizon - 130 + i * 28, 300, 6);
        }
        raf = requestAnimationFrame(draw);
      };
      draw();
      return () => cancelAnimationFrame(raf);
    }
  }, [gameState]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* INTRO */}
      {gameState === "intro" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            background:
              "radial-gradient(ellipse at center, #5d1259 0%, #1a0b3d 60%, #000 100%)",
          }}
        >
          <div className="text-center px-6">
            <div
              className="title-zoom"
              style={{
                fontSize: "clamp(3rem, 12vw, 9rem)",
                fontWeight: 900,
                letterSpacing: "0.05em",
                lineHeight: 0.9,
                color: "#ffd700",
                textShadow:
                  "0 0 30px #ff00aa, 0 0 60px #ff00aa, 4px 4px 0 #ff2266, 8px 8px 0 #00ffff",
              }}
            >
              <div className="glitch-text" style={{ color: "#fff" }}>BAGGY</div>
              <div className="glitch-text" style={{ color: "#ffd700", marginTop: "-0.1em" }}>AMAR</div>
              <div className="glitch-text" style={{ color: "#00ffff", marginTop: "-0.1em" }}>3 DA</div>
            </div>
            <div
              className="mt-8 neon-flicker"
              style={{
                fontSize: "clamp(1rem, 2.5vw, 1.5rem)",
                color: "#ff00aa",
                fontWeight: 700,
                letterSpacing: "0.3em",
              }}
            >
              ◆ THE LEGEND BEGINS ◆
            </div>
          </div>
          <div
            className="absolute bottom-12 text-white/60 text-sm tracking-widest animate-pulse"
            style={{ letterSpacing: "0.4em" }}
          >
            PRESS ANY KEY
          </div>
        </div>
      )}

      {/* MENU */}
      {gameState === "menu" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto">
            <h1
              className="title-zoom"
              style={{
                fontSize: "clamp(3rem, 10vw, 7rem)",
                fontWeight: 900,
                letterSpacing: "0.02em",
                lineHeight: 0.9,
                color: "#ffd700",
                textShadow:
                  "0 0 30px #ff00aa, 4px 4px 0 #ff2266, 8px 8px 30px rgba(0,0,0,0.8)",
              }}
            >
              BAGGY AMAR
            </h1>
            <div
              style={{
                fontSize: "clamp(1.5rem, 5vw, 3rem)",
                fontWeight: 900,
                color: "#00ffff",
                textShadow: "0 0 20px #00ffff, 3px 3px 0 #ff00aa",
                letterSpacing: "0.2em",
              }}
            >
              3 DA
            </div>

            <div className="mt-10 flex flex-col items-center gap-4">
              <button
                onClick={startGame}
                className="btn-press pulse-glow"
                style={{
                  padding: "16px 48px",
                  fontSize: "clamp(1.2rem, 3vw, 1.8rem)",
                  fontWeight: 900,
                  background: "linear-gradient(135deg, #ffd700, #ff00aa)",
                  color: "#1a0b3d",
                  border: "4px solid #fff",
                  borderRadius: "999px",
                  cursor: "pointer",
                  letterSpacing: "0.15em",
                  boxShadow: "0 8px 0 #5d1259, 0 12px 30px rgba(255, 0, 170, 0.6)",
                }}
              >
                ▶ JUMP IN
              </button>

              {highScore > 0 && (
                <div
                  className="mt-2 text-white/90 font-bold tracking-widest"
                  style={{ fontSize: "0.95rem" }}
                >
                  HI-SCORE:{" "}
                  <span style={{ color: "#ffd700", textShadow: "0 0 10px #ffd700" }}>
                    {highScore}
                  </span>
                </div>
              )}

              <div
                className="mt-6 text-white/70 text-xs tracking-widest"
                style={{ letterSpacing: "0.3em" }}
              >
                SPACE / TAP TO JUMP · DOUBLE TAP TO CLIMB
              </div>
              <div
                className="text-white/50 text-xs tracking-widest"
                style={{ letterSpacing: "0.3em" }}
              >
                COLLECT BAGGY JEANS · DODGE TROUBLE
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PLAYING HUD */}
      {gameState === "playing" && (
        <>
          <div
            className="absolute top-4 left-4 pointer-events-none"
            style={{
              padding: "10px 18px",
              background: "rgba(26, 11, 61, 0.85)",
              border: "2px solid #ffd700",
              borderRadius: "12px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 20px rgba(255, 215, 0, 0.4)",
            }}
          >
            <div
              style={{
                color: "#ffd700",
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.2em",
              }}
            >
              SCORE
            </div>
            <div
              style={{
                color: "#fff",
                fontSize: "1.6rem",
                fontWeight: 900,
                lineHeight: 1,
                textShadow: "0 0 10px #ffd700",
              }}
            >
              {score}
            </div>
          </div>

          <div
            className="absolute top-4 right-4 pointer-events-none"
            style={{
              padding: "10px 18px",
              background: "rgba(26, 11, 61, 0.85)",
              border: "2px solid #00ffff",
              borderRadius: "12px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 20px rgba(0, 255, 255, 0.4)",
            }}
          >
            <div
              style={{
                color: "#00ffff",
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.2em",
              }}
            >
              JEANS
            </div>
            <div
              style={{
                color: "#fff",
                fontSize: "1.6rem",
                fontWeight: 900,
                lineHeight: 1,
                textShadow: "0 0 10px #00ffff",
              }}
            >
              👖 {collected}
            </div>
          </div>

          {/* Tap zone for mobile */}
          <div
            className="absolute inset-0"
            onPointerDown={(e) => {
              e.preventDefault();
              jump();
            }}
            style={{ touchAction: "none" }}
          />
        </>
      )}

      {/* GAME OVER */}
      {gameState === "gameover" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            background: "rgba(10, 5, 24, 0.85)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="text-center px-6">
            <h2
              className="title-zoom"
              style={{
                fontSize: "clamp(2.5rem, 8vw, 5.5rem)",
                fontWeight: 900,
                color: "#ff2266",
                textShadow: "0 0 30px #ff2266, 4px 4px 0 #1a0b3d",
                letterSpacing: "0.05em",
              }}
            >
              GAME OVER
            </h2>

            <div className="mt-8 flex flex-col items-center gap-3">
              <div
                style={{
                  padding: "20px 36px",
                  background: "rgba(26, 11, 61, 0.9)",
                  border: "3px solid #ffd700",
                  borderRadius: "16px",
                  minWidth: "280px",
                  boxShadow: "0 0 30px rgba(255, 215, 0, 0.4)",
                }}
              >
                <div className="flex justify-between items-center mb-3">
                  <span style={{ color: "#ffd700", fontWeight: 700, letterSpacing: "0.1em" }}>
                    SCORE
                  </span>
                  <span
                    style={{
                      color: "#fff",
                      fontSize: "2rem",
                      fontWeight: 900,
                      textShadow: "0 0 10px #ffd700",
                    }}
                  >
                    {score}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-3">
                  <span style={{ color: "#00ffff", fontWeight: 700, letterSpacing: "0.1em" }}>
                    JEANS
                  </span>
                  <span style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 900 }}>
                    👖 {collected}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: "#ff00aa", fontWeight: 700, letterSpacing: "0.1em" }}>
                    HI-SCORE
                  </span>
                  <span
                    style={{
                      color: "#ffd700",
                      fontSize: "1.3rem",
                      fontWeight: 900,
                      textShadow: "0 0 10px #ffd700",
                    }}
                  >
                    {highScore}
                  </span>
                </div>
                {score >= highScore && score > 0 && (
                  <div
                    className="mt-4 neon-flicker"
                    style={{
                      color: "#ffd700",
                      fontWeight: 900,
                      letterSpacing: "0.2em",
                      textShadow: "0 0 20px #ffd700",
                    }}
                  >
                    ★ NEW RECORD ★
                  </div>
                )}
              </div>

              <button
                onClick={startGame}
                className="btn-press pulse-glow mt-4"
                style={{
                  padding: "14px 40px",
                  fontSize: "clamp(1.1rem, 2.5vw, 1.5rem)",
                  fontWeight: 900,
                  background: "linear-gradient(135deg, #ffd700, #ff00aa)",
                  color: "#1a0b3d",
                  border: "4px solid #fff",
                  borderRadius: "999px",
                  cursor: "pointer",
                  letterSpacing: "0.15em",
                  boxShadow: "0 6px 0 #5d1259, 0 10px 25px rgba(255, 0, 170, 0.6)",
                }}
              >
                ↻ RUN IT BACK
              </button>

              <button
                onClick={() => setGameState("menu")}
                className="btn-press mt-2"
                style={{
                  padding: "10px 28px",
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  background: "transparent",
                  color: "#fff",
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderRadius: "999px",
                  cursor: "pointer",
                  letterSpacing: "0.2em",
                }}
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
