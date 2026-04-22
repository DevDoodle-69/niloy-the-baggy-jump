import { useEffect, useRef, useState, useCallback } from "react";
import playerImg from "@assets/Picsart_26-04-22_22-07-58-568_1776874889373.png";
import jeansImg from "@assets/Picsart_26-04-22_22-16-38-121_1776874882176.png";
import faceImg from "@assets/IMG_20260422_222620_505_1776875465902.jpg";

type GameState = "intro" | "menu" | "playing" | "gameover";

type ObstacleType = "spike" | "rock" | "saw" | "drone" | "fire";
type PowerUpType = "magnet" | "shield" | "boost";

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  type: ObstacleType;
  rot: number;
  vy?: number;
  baseY?: number;
}

interface Collectible {
  x: number;
  y: number;
  w: number;
  h: number;
  collected: boolean;
  bob: number;
  rot: number;
  golden: boolean;
}

interface PowerUp {
  x: number;
  y: number;
  w: number;
  h: number;
  type: PowerUpType;
  collected: boolean;
  bob: number;
  pulse: number;
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
  gravity?: number;
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

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  vy: number;
}

const GRAVITY = 0.75;
const JUMP_VELOCITY = -16;
const COYOTE_FRAMES = 6;
const JUMP_BUFFER_FRAMES = 8;
const VARIABLE_JUMP_CUTOFF = -7;
const GROUND_Y_RATIO = 0.82;
const PLAYER_W = 70;
const PLAYER_H = 110;
const SCROLL_SPEED_BASE = 5.2;

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>("intro");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const stored = localStorage.getItem("baggyAmarHigh");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [collected, setCollected] = useState(0);
  const [combo, setCombo] = useState(0);
  const [activePower, setActivePower] = useState<PowerUpType | null>(null);
  const [powerTime, setPowerTime] = useState(0);
  const [readyOverlay, setReadyOverlay] = useState<string | null>(null);

  const stateRef = useRef({
    player: {
      x: 140,
      y: 0,
      vy: 0,
      vx: 0,
      onGround: true,
      doubleJumped: false,
      climbing: false,
      tilt: 0,
      coyote: 0,
      jumpBuffer: 0,
      jumpHeld: false,
      sliding: false,
      slideTimer: 0,
      invuln: 0,
    },
    obstacles: [] as Obstacle[],
    collectibles: [] as Collectible[],
    powerUps: [] as PowerUp[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    clouds: [] as Cloud[],
    buildings: [] as Building[],
    scroll: 0,
    speed: SCROLL_SPEED_BASE,
    spawnTimer: 0,
    collectTimer: 0,
    powerTimer: 0,
    score: 0,
    collected: 0,
    combo: 0,
    comboTimer: 0,
    frame: 0,
    bgOffset: 0,
    shake: 0,
    flash: 0,
    runFrame: 0,
    activePower: null as PowerUpType | null,
    powerDuration: 0,
    wind: 0,
    windTarget: 0,
    timeOfDay: 0,
  });

  const playerImgRef = useRef<HTMLImageElement | null>(null);
  const jeansImgRef = useRef<HTMLImageElement | null>(null);
  const faceImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const p = new Image();
    p.src = playerImg;
    p.onload = () => { playerImgRef.current = p; };
    const j = new Image();
    j.src = jeansImg;
    j.onload = () => { jeansImgRef.current = j; };
    const f = new Image();
    f.src = faceImg;
    f.onload = () => { faceImgRef.current = f; };
  }, []);

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playSound = useCallback((type: "jump" | "collect" | "hit" | "start" | "power" | "combo") => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const beep = (freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + delay);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + delay + dur);
        gain.gain.setValueAtTime(vol, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + dur);
      };
      if (type === "jump") beep(380, 0.12, "square", 0.18, 0, 720);
      else if (type === "collect") {
        beep(880, 0.1, "triangle", 0.15);
        beep(1320, 0.1, "triangle", 0.15, 0.04);
        beep(1760, 0.12, "triangle", 0.15, 0.08);
      } else if (type === "hit") beep(220, 0.4, "sawtooth", 0.3, 0, 60);
      else if (type === "start") {
        [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.2, "square", 0.15, i * 0.08));
      } else if (type === "power") {
        [440, 660, 880, 1100, 1320].forEach((f, i) => beep(f, 0.15, "sine", 0.2, i * 0.05));
      } else if (type === "combo") {
        beep(1000, 0.08, "triangle", 0.2);
        beep(1500, 0.1, "triangle", 0.2, 0.05);
      }
    } catch {}
  }, []);

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const groundY = canvas.height * GROUND_Y_RATIO;
    const s = stateRef.current;
    s.player = {
      x: 140,
      y: groundY - PLAYER_H,
      vy: 0,
      vx: 0,
      onGround: true,
      doubleJumped: false,
      climbing: false,
      tilt: 0,
      coyote: 0,
      jumpBuffer: 0,
      jumpHeld: false,
      sliding: false,
      slideTimer: 0,
      invuln: 0,
    };
    s.obstacles = [];
    s.collectibles = [];
    s.powerUps = [];
    s.particles = [];
    s.floatingTexts = [];
    s.scroll = 0;
    s.speed = SCROLL_SPEED_BASE;
    // Grace period at start: no obstacles for the first ~3 seconds, easy ramp after
    s.spawnTimer = 220;
    s.collectTimer = 90;
    s.powerTimer = 900;
    s.score = 0;
    s.collected = 0;
    s.combo = 0;
    s.comboTimer = 0;
    s.frame = 0;
    s.shake = 0;
    s.flash = 0;
    s.activePower = null;
    s.powerDuration = 0;
    s.wind = 0;
    s.windTarget = 0;
    s.timeOfDay = 0;
    setScore(0);
    setCollected(0);
    setCombo(0);
    setActivePower(null);
    setPowerTime(0);

    s.clouds = [];
    for (let i = 0; i < 8; i++) {
      s.clouds.push({
        x: Math.random() * canvas.width,
        y: 30 + Math.random() * (canvas.height * 0.35),
        speed: 0.3 + Math.random() * 0.7,
        size: 30 + Math.random() * 60,
      });
    }
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
    // "GET READY → RUN!" overlay during the grace period
    setReadyOverlay("GET READY");
    setTimeout(() => setReadyOverlay("RUN!"), 1400);
    setTimeout(() => setReadyOverlay(null), 2600);
  }, [playSound, resetGame]);

  const tryJump = useCallback(() => {
    const s = stateRef.current;
    s.player.jumpBuffer = JUMP_BUFFER_FRAMES;
    s.player.jumpHeld = true;
  }, []);

  const releaseJump = useCallback(() => {
    const s = stateRef.current;
    s.player.jumpHeld = false;
    if (s.player.vy < VARIABLE_JUMP_CUTOFF) {
      s.player.vy = VARIABLE_JUMP_CUTOFF;
    }
  }, []);

  // Input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        if (gameState === "playing") tryJump();
        else if (gameState === "menu" || gameState === "gameover") startGame();
        else if (gameState === "intro") setGameState("menu");
      } else if (e.code === "Enter") {
        if (gameState === "menu" || gameState === "gameover") startGame();
        else if (gameState === "intro") setGameState("menu");
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        const s = stateRef.current;
        if (gameState === "playing" && s.player.onGround) {
          s.player.sliding = true;
          s.player.slideTimer = 30;
        } else if (gameState === "playing" && !s.player.onGround) {
          s.player.vy = Math.max(s.player.vy + 6, 12);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        if (gameState === "playing") releaseJump();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [gameState, tryJump, releaseJump, startGame]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
      const W = window.innerWidth;
      const H = window.innerHeight;
      const groundY = H * GROUND_Y_RATIO;

      s.frame++;
      s.runFrame = (s.runFrame + 0.3 + s.speed * 0.02) % 4;
      s.timeOfDay += 0.0008;

      // Difficulty — gentle ramp at start then accelerating
      const speedMultiplier = s.activePower === "boost" ? 1.5 : 1;
      const warmup = Math.min(1, s.frame / 240); // ease in over first ~4s
      const baseSpeed = SCROLL_SPEED_BASE * (0.7 + 0.3 * warmup);
      s.speed = (baseSpeed + Math.min(8, s.score / 220)) * speedMultiplier;

      // Wind drift
      if (s.frame % 180 === 0) s.windTarget = (Math.random() - 0.5) * 1.2;
      s.wind += (s.windTarget - s.wind) * 0.02;

      // Power timer
      if (s.activePower) {
        s.powerDuration--;
        if (s.powerDuration <= 0) {
          s.activePower = null;
          setActivePower(null);
        } else if (s.frame % 5 === 0) {
          setPowerTime(s.powerDuration);
        }
      }

      // Combo timer
      if (s.comboTimer > 0) {
        s.comboTimer--;
        if (s.comboTimer === 0 && s.combo > 0) {
          s.combo = 0;
          setCombo(0);
        }
      }

      // Player physics — variable jump
      const p = s.player;

      // coyote time
      if (p.onGround) p.coyote = COYOTE_FRAMES;
      else if (p.coyote > 0) p.coyote--;

      // jump buffer
      if (p.jumpBuffer > 0) {
        p.jumpBuffer--;
        if (p.onGround || p.coyote > 0) {
          p.vy = JUMP_VELOCITY;
          p.onGround = false;
          p.doubleJumped = false;
          p.coyote = 0;
          p.jumpBuffer = 0;
          playSound("jump");
          for (let i = 0; i < 10; i++) {
            s.particles.push({
              x: p.x + PLAYER_W / 2 + (Math.random() - 0.5) * 30,
              y: p.y + PLAYER_H,
              vx: (Math.random() - 0.5) * 5,
              vy: -Math.random() * 3,
              life: 25,
              maxLife: 25,
              color: "#c9a87a",
              size: 3 + Math.random() * 3,
            });
          }
        } else if (!p.doubleJumped) {
          p.vy = JUMP_VELOCITY * 0.88;
          p.doubleJumped = true;
          p.climbing = true;
          p.jumpBuffer = 0;
          playSound("jump");
          for (let i = 0; i < 14; i++) {
            s.particles.push({
              x: p.x + PLAYER_W / 2,
              y: p.y + PLAYER_H / 2,
              vx: (Math.random() - 0.5) * 7,
              vy: (Math.random() - 0.5) * 7,
              life: 32,
              maxLife: 32,
              color: ["#ffd700", "#ff00aa", "#00ffff"][Math.floor(Math.random() * 3)],
              size: 2 + Math.random() * 3,
            });
          }
        }
      }

      // gravity (lighter when holding jump)
      const gravScale = p.vy < 0 && p.jumpHeld ? 0.55 : 1;
      p.vy += GRAVITY * gravScale;
      // terminal velocity
      if (p.vy > 22) p.vy = 22;
      p.y += p.vy;

      // Slide logic
      if (p.sliding) {
        p.slideTimer--;
        if (p.slideTimer <= 0) p.sliding = false;
      }

      if (p.y >= groundY - PLAYER_H) {
        const wasAir = !p.onGround;
        p.y = groundY - PLAYER_H;
        if (wasAir && p.vy > 8) {
          // landing dust
          for (let i = 0; i < 12; i++) {
            s.particles.push({
              x: p.x + PLAYER_W / 2 + (Math.random() - 0.5) * PLAYER_W,
              y: groundY,
              vx: (Math.random() - 0.5) * 6,
              vy: -Math.random() * 2,
              life: 20,
              maxLife: 20,
              color: "#c9a87a",
              size: 3,
            });
          }
          s.shake = Math.min(s.shake + 4, 8);
        }
        p.vy = 0;
        p.onGround = true;
        p.doubleJumped = false;
        p.climbing = false;
      } else {
        p.onGround = false;
      }
      p.tilt = Math.max(-0.3, Math.min(0.3, p.vy * 0.025));

      if (p.invuln > 0) p.invuln--;

      // Spawn obstacles — only after warm-up grace period (~3.5s of running room)
      s.spawnTimer--;
      const obstaclesUnlocked = s.frame > 210;
      if (obstaclesUnlocked && s.spawnTimer <= 0) {
        // Start with only easy obstacles, expand the pool as score climbs
        const types: ObstacleType[] = ["spike"];
        if (s.score > 50) types.push("rock");
        if (s.score > 150) types.push("saw");
        if (s.score > 350) types.push("drone");
        if (s.score > 700) types.push("fire");
        const type = types[Math.floor(Math.random() * types.length)];
        let w = 50, h = 60, y = groundY - 60, vy = 0, baseY = 0;
        if (type === "saw") { w = 60; h = 60; y = groundY - h + (Math.random() < 0.3 ? -90 : 0); }
        else if (type === "rock") { w = 70; h = 70; y = groundY - h; }
        else if (type === "spike") { w = 50; h = 60; y = groundY - h; }
        else if (type === "drone") {
          w = 64; h = 50;
          baseY = groundY - 160 - Math.random() * 80;
          y = baseY;
        } else if (type === "fire") {
          w = 80; h = 100; y = groundY - h;
        }
        s.obstacles.push({
          x: W + 40, y, w, h, type, rot: 0, vy, baseY,
        });
        // Spawn rate eases in: very loose at first, tightens with score
        const earlyEase = Math.max(0, 1 - s.score / 200); // 1 -> 0 over first 200 score
        s.spawnTimer = Math.max(45, 130 - s.score / 22) + earlyEase * 80;
        // sometimes pair (only later in run)
        if (Math.random() < 0.15 && s.score > 400) {
          s.spawnTimer = 32;
        }
      }

      // Spawn collectibles
      s.collectTimer--;
      if (s.collectTimer <= 0) {
        const isGolden = Math.random() < 0.08;
        const w = isGolden ? 70 : 56;
        const h = isGolden ? 100 : 80;
        // Sometimes spawn arc of jeans
        if (Math.random() < 0.35) {
          const count = 4 + Math.floor(Math.random() * 3);
          const startX = W + 40;
          const peakHeight = 100 + Math.random() * 140;
          for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const arcY = groundY - h - 40 - peakHeight * Math.sin(t * Math.PI);
            s.collectibles.push({
              x: startX + i * 70,
              y: arcY,
              w: 56, h: 80,
              collected: false,
              bob: Math.random() * Math.PI * 2,
              rot: 0,
              golden: false,
            });
          }
        } else {
          const heightTier = Math.floor(Math.random() * 3);
          const yPos = heightTier === 0 ? groundY - h - 20
            : heightTier === 1 ? groundY - h - 130
            : groundY - h - 220;
          s.collectibles.push({
            x: W + 40 + Math.random() * 200,
            y: yPos, w, h,
            collected: false,
            bob: Math.random() * Math.PI * 2,
            rot: 0,
            golden: isGolden,
          });
        }
        s.collectTimer = 70 + Math.random() * 50;
      }

      // Spawn power-ups
      s.powerTimer--;
      if (s.powerTimer <= 0) {
        const types: PowerUpType[] = ["magnet", "shield", "boost"];
        const type = types[Math.floor(Math.random() * types.length)];
        s.powerUps.push({
          x: W + 40,
          y: groundY - 60 - Math.random() * 180,
          w: 50, h: 50,
          type,
          collected: false,
          bob: Math.random() * Math.PI * 2,
          pulse: 0,
        });
        s.powerTimer = 700 + Math.random() * 500;
      }

      // Move obstacles
      s.obstacles = s.obstacles.filter((o) => {
        o.x -= s.speed;
        if (o.type === "saw") o.rot += 0.35;
        if (o.type === "drone") {
          o.y = (o.baseY ?? o.y) + Math.sin(s.frame * 0.07 + o.x * 0.01) * 25;
          o.x -= 0.8;
        }
        if (o.type === "fire") o.rot += 0.2;
        return o.x > -150;
      });

      // Move collectibles (with magnet)
      const magnetActive = s.activePower === "magnet";
      s.collectibles = s.collectibles.filter((c) => {
        c.x -= s.speed;
        c.bob += 0.1;
        c.rot += 0.05;
        if (magnetActive && !c.collected) {
          const dx = (p.x + PLAYER_W / 2) - (c.x + c.w / 2);
          const dy = (p.y + PLAYER_H / 2) - (c.y + c.h / 2);
          const dist = Math.hypot(dx, dy);
          if (dist < 280) {
            c.x += (dx / dist) * 8;
            c.y += (dy / dist) * 8;
          }
        }
        return c.x > -100 && !c.collected;
      });

      // Move powerups
      s.powerUps = s.powerUps.filter((pu) => {
        pu.x -= s.speed;
        pu.bob += 0.08;
        pu.pulse += 0.15;
        return pu.x > -100 && !pu.collected;
      });

      // Collisions — player hitbox shrinks when sliding
      const slideShrink = p.sliding ? 30 : 0;
      const px = p.x + 12;
      const py = p.y + 10 + slideShrink;
      const pw = PLAYER_W - 24;
      const ph = PLAYER_H - 16 - slideShrink;

      const shieldActive = s.activePower === "shield";

      for (const o of s.obstacles) {
        const ox = o.x + 6;
        const oy = o.y + 6;
        const ow = o.w - 12;
        const oh = o.h - 12;
        if (px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy) {
          if (shieldActive || p.invuln > 0) {
            // Break shield, push obstacle away as particles
            if (shieldActive) {
              s.activePower = null;
              setActivePower(null);
              p.invuln = 60;
              for (let i = 0; i < 30; i++) {
                s.particles.push({
                  x: o.x + o.w / 2,
                  y: o.y + o.h / 2,
                  vx: (Math.random() - 0.5) * 14,
                  vy: (Math.random() - 0.5) * 14,
                  life: 40,
                  maxLife: 40,
                  color: ["#00ffff", "#ffffff", "#aaeeff"][Math.floor(Math.random() * 3)],
                  size: 3 + Math.random() * 4,
                });
              }
              s.flash = 0.6;
              s.shake = 12;
              o.x = -9999;
              s.floatingTexts.push({
                x: p.x + PLAYER_W / 2,
                y: p.y - 10,
                text: "BLOCKED!",
                life: 50, maxLife: 50,
                color: "#00ffff",
                size: 24,
                vy: -1.5,
              });
              continue;
            }
            continue;
          }
          // hit
          playSound("hit");
          s.shake = 22;
          s.flash = 1;
          for (let i = 0; i < 35; i++) {
            s.particles.push({
              x: p.x + PLAYER_W / 2,
              y: p.y + PLAYER_H / 2,
              vx: (Math.random() - 0.5) * 14,
              vy: (Math.random() - 0.5) * 14,
              life: 55,
              maxLife: 55,
              color: ["#ff4444", "#ff8800", "#ffd700"][Math.floor(Math.random() * 3)],
              size: 3 + Math.random() * 5,
              gravity: 0.3,
            });
          }
          const finalScore = Math.floor(s.score);
          if (finalScore > highScore) {
            setHighScore(finalScore);
            localStorage.setItem("baggyAmarHigh", finalScore.toString());
          }
          setScore(finalScore);
          setCollected(s.collected);
          setTimeout(() => setGameState("gameover"), 700);
          return;
        }
      }

      for (const c of s.collectibles) {
        if (c.collected) continue;
        if (px < c.x + c.w && px + pw > c.x && py < c.y + c.h && py + ph > c.y) {
          c.collected = true;
          s.collected++;
          s.combo++;
          s.comboTimer = 120;
          const points = (c.golden ? 250 : 50) * Math.max(1, Math.floor(s.combo / 3) + 1);
          s.score += points;
          playSound(s.combo > 1 && s.combo % 3 === 0 ? "combo" : "collect");
          setCombo(s.combo);

          s.floatingTexts.push({
            x: c.x + c.w / 2,
            y: c.y,
            text: `+${points}`,
            life: 40, maxLife: 40,
            color: c.golden ? "#ffd700" : "#ffffff",
            size: c.golden ? 28 : 22,
            vy: -2,
          });

          if (s.combo > 1 && s.combo % 5 === 0) {
            s.floatingTexts.push({
              x: p.x + PLAYER_W / 2,
              y: p.y - 30,
              text: `${s.combo}x COMBO!`,
              life: 60, maxLife: 60,
              color: "#ff00aa",
              size: 32,
              vy: -1.5,
            });
          }

          for (let i = 0; i < (c.golden ? 28 : 16); i++) {
            s.particles.push({
              x: c.x + c.w / 2,
              y: c.y + c.h / 2,
              vx: (Math.random() - 0.5) * 9,
              vy: (Math.random() - 0.5) * 9 - 2,
              life: 45,
              maxLife: 45,
              color: c.golden
                ? ["#ffd700", "#ffaa00", "#fff"][Math.floor(Math.random() * 3)]
                : ["#ffd700", "#00ffff", "#ff00aa", "#ffffff"][Math.floor(Math.random() * 4)],
              size: 2 + Math.random() * 4,
            });
          }
        }
      }

      for (const pu of s.powerUps) {
        if (pu.collected) continue;
        if (px < pu.x + pu.w && px + pw > pu.x && py < pu.y + pu.h && py + ph > pu.y) {
          pu.collected = true;
          s.activePower = pu.type;
          s.powerDuration = pu.type === "boost" ? 360 : 480;
          setActivePower(pu.type);
          setPowerTime(s.powerDuration);
          playSound("power");
          s.flash = 0.4;
          const txt = pu.type === "magnet" ? "MAGNET!" : pu.type === "shield" ? "SHIELD!" : "BOOST!";
          const col = pu.type === "magnet" ? "#ff00aa" : pu.type === "shield" ? "#00ffff" : "#ffd700";
          s.floatingTexts.push({
            x: p.x + PLAYER_W / 2,
            y: p.y - 30,
            text: txt,
            life: 80, maxLife: 80,
            color: col,
            size: 36,
            vy: -1,
          });
          for (let i = 0; i < 30; i++) {
            s.particles.push({
              x: pu.x + pu.w / 2,
              y: pu.y + pu.h / 2,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              life: 50,
              maxLife: 50,
              color: col,
              size: 3 + Math.random() * 4,
            });
          }
        }
      }

      // Score over time
      s.score += 0.25 * speedMultiplier;

      // Update particles
      s.particles = s.particles.filter((pa) => {
        pa.x += pa.vx;
        pa.y += pa.vy;
        pa.vy += pa.gravity ?? 0.2;
        pa.life--;
        return pa.life > 0;
      });

      // Floating texts
      s.floatingTexts = s.floatingTexts.filter((ft) => {
        ft.y += ft.vy;
        ft.vy *= 0.96;
        ft.life--;
        return ft.life > 0;
      });

      // Clouds
      for (const cl of s.clouds) {
        cl.x -= cl.speed + s.wind * 0.5;
        if (cl.x < -cl.size * 2) {
          cl.x = W + cl.size;
          cl.y = 30 + Math.random() * (H * 0.35);
        } else if (cl.x > W + cl.size * 2) {
          cl.x = -cl.size;
        }
      }

      for (const b of s.buildings) b.x -= s.speed * 0.3;
      while (s.buildings.length && s.buildings[0].x + s.buildings[0].w < 0) s.buildings.shift();
      let lastX = s.buildings.length ? s.buildings[s.buildings.length - 1].x + s.buildings[s.buildings.length - 1].w : 0;
      while (lastX < W + 200) {
        const w = 80 + Math.random() * 120;
        const h = 140 + Math.random() * 220;
        s.buildings.push({
          x: lastX + 8, w, h,
          color: ["#1a1233", "#241845", "#2d1b54", "#1f1340"][Math.floor(Math.random() * 4)],
        });
        lastX += w + 8;
      }

      // === RENDER ===
      // Sky shifts with time
      const tod = (Math.sin(s.timeOfDay) + 1) / 2; // 0..1
      const skyTop = `hsl(${260 - tod * 30}, 70%, ${10 + tod * 8}%)`;
      const skyMid = `hsl(${290 - tod * 40}, 60%, ${20 + tod * 10}%)`;
      const skyBot = `hsl(${20 - tod * 10}, 90%, ${50 + tod * 10}%)`;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, skyTop);
      grad.addColorStop(0.5, skyMid);
      grad.addColorStop(1, skyBot);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Sun
      ctx.save();
      ctx.fillStyle = "#ffd76b";
      ctx.shadowColor = "#ffaa00";
      ctx.shadowBlur = 60;
      ctx.beginPath();
      ctx.arc(W * 0.78, H * 0.32 + Math.sin(s.timeOfDay) * 30, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Stars
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 60; i++) {
        const sx = (i * 137 + s.frame * 0.1) % W;
        const sy = (i * 73) % (H * 0.4);
        const tw = 0.5 + 0.5 * Math.sin(s.frame * 0.05 + i);
        ctx.globalAlpha = tw * 0.7;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;

      // Shake
      ctx.save();
      if (s.shake > 0) {
        ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
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
        ctx.fillStyle = "rgba(255, 220, 100, 0.6)";
        for (let wy = groundY - b.h + 20; wy < groundY - 30; wy += 24) {
          for (let wx = b.x + 10; wx < b.x + b.w - 14; wx += 20) {
            if ((Math.floor(wx + wy) % 3) !== 0) {
              ctx.fillRect(wx, wy, 8, 12);
            }
          }
        }
        ctx.fillStyle = "rgba(255, 0, 170, 0.4)";
        ctx.fillRect(b.x, groundY - b.h, b.w, 3);
      }

      // Ground
      const groundGrad = ctx.createLinearGradient(0, groundY, 0, H);
      groundGrad.addColorStop(0, "#2a1a4a");
      groundGrad.addColorStop(1, "#0a0518");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, groundY, W, H - groundY);

      ctx.fillStyle = "rgba(255, 215, 0, 0.5)";
      const stripeOffset = -(s.scroll % 80);
      s.scroll += s.speed;
      for (let x = stripeOffset; x < W; x += 80) {
        ctx.fillRect(x, groundY + 8, 40, 4);
      }

      ctx.strokeStyle = "#ff00aa";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#ff00aa";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(W, groundY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Power-ups
      for (const pu of s.powerUps) {
        const bobY = Math.sin(pu.bob) * 6;
        const pulse = 1 + Math.sin(pu.pulse) * 0.15;
        ctx.save();
        ctx.translate(pu.x + pu.w / 2, pu.y + pu.h / 2 + bobY);
        ctx.scale(pulse, pulse);
        const col = pu.type === "magnet" ? "#ff00aa" : pu.type === "shield" ? "#00ffff" : "#ffd700";
        ctx.shadowColor = col;
        ctx.shadowBlur = 30;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, 0, pu.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a0b3d";
        ctx.font = "bold 28px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const icon = pu.type === "magnet" ? "M" : pu.type === "shield" ? "S" : "B";
        ctx.fillText(icon, 0, 2);
        ctx.restore();
      }

      // Collectibles
      for (const c of s.collectibles) {
        const bobY = Math.sin(c.bob) * 6;
        ctx.save();
        ctx.translate(c.x + c.w / 2, c.y + c.h / 2 + bobY);
        ctx.rotate(Math.sin(c.rot) * 0.15);
        ctx.shadowColor = c.golden ? "#ffd700" : "#ffaa44";
        ctx.shadowBlur = c.golden ? 40 : 22;
        if (jeansImgRef.current) {
          if (c.golden) {
            ctx.filter = "hue-rotate(40deg) saturate(2) brightness(1.4)";
          }
          ctx.drawImage(jeansImgRef.current, -c.w / 2, -c.h / 2, c.w, c.h);
          ctx.filter = "none";
        } else {
          ctx.fillStyle = c.golden ? "#ffd700" : "#3a6da8";
          ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        }
        ctx.restore();
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
        } else if (o.type === "drone") {
          ctx.save();
          ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
          ctx.fillStyle = "#222";
          ctx.shadowColor = "#ff2266";
          ctx.shadowBlur = 15;
          // body
          ctx.fillRect(-o.w / 2 + 10, -8, o.w - 20, 16);
          // propellers
          ctx.fillStyle = "rgba(200,200,200,0.6)";
          const rotProp = s.frame * 0.8;
          for (const dx of [-o.w / 2 + 6, o.w / 2 - 6]) {
            ctx.save();
            ctx.translate(dx, -10);
            ctx.rotate(rotProp);
            ctx.fillRect(-12, -1, 24, 2);
            ctx.fillRect(-1, -12, 2, 24);
            ctx.restore();
          }
          // red eye
          ctx.fillStyle = "#ff2266";
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (o.type === "fire") {
          ctx.save();
          ctx.translate(o.x + o.w / 2, o.y + o.h);
          // base
          ctx.fillStyle = "#3a1a0a";
          ctx.fillRect(-o.w / 2, -10, o.w, 10);
          // flames
          for (let i = 0; i < 5; i++) {
            const off = (s.frame * 0.3 + i) * 0.7;
            const fy = -20 - i * 16 + Math.sin(off) * 4;
            const fw = (o.w - i * 8);
            const colors = ["#ffdd00", "#ff8800", "#ff4400", "#cc2200", "#881100"];
            ctx.fillStyle = colors[i];
            ctx.shadowColor = colors[i];
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.ellipse(0, fy, fw / 2, 18, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // Player
      ctx.save();
      ctx.translate(p.x + PLAYER_W / 2, p.y + PLAYER_H / 2);
      ctx.rotate(p.tilt);
      // shield aura
      if (s.activePower === "shield") {
        const r = PLAYER_W * 0.85 + Math.sin(s.frame * 0.2) * 4;
        ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#00ffff";
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(0, 255, 255, 0.08)";
        ctx.fill();
      }
      // boost trail
      if (s.activePower === "boost" && s.frame % 2 === 0) {
        s.particles.push({
          x: p.x,
          y: p.y + PLAYER_H * 0.6 + Math.random() * 20,
          vx: -3 - Math.random() * 3,
          vy: (Math.random() - 0.5) * 1,
          life: 22, maxLife: 22,
          color: ["#ffd700", "#ff8800"][Math.floor(Math.random() * 2)],
          size: 4 + Math.random() * 3,
        });
      }
      // climbing aura
      if (p.climbing) {
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 30;
      } else {
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 8;
      }
      // invuln flicker
      if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) {
        ctx.globalAlpha = 0.4;
      }
      const runBob = p.onGround && !p.sliding ? Math.sin(s.runFrame * Math.PI) * 2 : 0;
      const slideY = p.sliding ? 30 : 0;
      const slideRot = p.sliding ? -0.4 : 0;
      ctx.rotate(slideRot);
      if (playerImgRef.current) {
        ctx.drawImage(playerImgRef.current, -PLAYER_W / 2, -PLAYER_H / 2 + runBob + slideY, PLAYER_W, PLAYER_H);
      } else {
        ctx.fillStyle = "#222";
        ctx.fillRect(-PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      const shadowScale = Math.max(0.4, 1 - (groundY - p.y - PLAYER_H) / 300);
      ctx.ellipse(p.x + PLAYER_W / 2, groundY + 4, PLAYER_W * 0.4 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Particles
      for (const pa of s.particles) {
        const alpha = pa.life / pa.maxLife;
        ctx.fillStyle = pa.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
      }
      ctx.globalAlpha = 1;

      // Floating texts
      for (const ft of s.floatingTexts) {
        const alpha = Math.min(1, ft.life / 20);
        ctx.globalAlpha = alpha;
        ctx.font = `900 ${ft.size}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillText(ft.text, ft.x + 2, ft.y + 2);
        ctx.fillStyle = ft.color;
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 12;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.flash})`;
        ctx.fillRect(0, 0, W, H);
        s.flash *= 0.85;
      }

      if (s.frame % 6 === 0) {
        setScore(Math.floor(s.score));
        setCollected(s.collected);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [gameState, playSound, highScore]);

  // Ambient bg for menu / gameover
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
        const W = window.innerWidth;
        const H = window.innerHeight;
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "#1a0b3d");
        grad.addColorStop(0.5, "#5d1259");
        grad.addColorStop(1, "#ff6b35");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
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
        const sunGrad = ctx.createLinearGradient(0, horizon - 200, 0, horizon);
        sunGrad.addColorStop(0, "#ffd76b");
        sunGrad.addColorStop(1, "#ff2266");
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(W / 2, horizon, 150, Math.PI, 0);
        ctx.fill();
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

  const powerLabel = activePower === "magnet" ? "MAGNET" : activePower === "shield" ? "SHIELD" : activePower === "boost" ? "BOOST" : "";
  const powerColor = activePower === "magnet" ? "#ff00aa" : activePower === "shield" ? "#00ffff" : "#ffd700";

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* INTRO */}
      {gameState === "intro" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            background: "radial-gradient(ellipse at center, #5d1259 0%, #1a0b3d 60%, #000 100%)",
          }}
        >
          <div className="text-center px-6">
            <div
              className="title-zoom"
              style={{
                fontSize: "clamp(2.6rem, 11vw, 9rem)",
                fontWeight: 900,
                letterSpacing: "0.05em",
                lineHeight: 0.9,
                color: "#ffd700",
                textShadow: "0 0 30px #ff00aa, 0 0 60px #ff00aa, 4px 4px 0 #ff2266, 8px 8px 0 #00ffff",
              }}
            >
              <div className="glitch-text" style={{ color: "#fff" }}>BAGGY</div>
              <div className="glitch-text" style={{ color: "#ffd700", marginTop: "-0.1em" }}>AMAR</div>
              <div className="glitch-text" style={{ color: "#00ffff", marginTop: "-0.1em" }}>3 DA</div>
            </div>
            <div
              className="mt-8 neon-flicker"
              style={{
                fontSize: "clamp(0.9rem, 2.5vw, 1.5rem)",
                color: "#ff00aa",
                fontWeight: 700,
                letterSpacing: "0.3em",
              }}
            >
              ◆ THE LEGEND BEGINS ◆
            </div>
          </div>
          <div className="absolute bottom-12 text-white/60 text-sm tracking-widest animate-pulse" style={{ letterSpacing: "0.4em" }}>
            PRESS ANY KEY
          </div>
        </div>
      )}

      {/* MENU */}
      {gameState === "menu" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4">
          <div className="text-center pointer-events-auto flex flex-col items-center">
            {/* Hero portrait */}
            <div
              className="pulse-glow mb-4"
              style={{
                width: "clamp(120px, 22vw, 200px)",
                height: "clamp(120px, 22vw, 200px)",
                borderRadius: "999px",
                overflow: "hidden",
                border: "5px solid #ffd700",
                boxShadow: "0 0 40px #ff00aa, inset 0 0 20px rgba(0,0,0,0.4)",
                background: "#1a0b3d",
              }}
            >
              <img
                src={faceImg}
                alt="AMAR"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                draggable={false}
              />
            </div>

            <h1
              className="title-zoom"
              style={{
                fontSize: "clamp(2.4rem, 9vw, 6rem)",
                fontWeight: 900,
                letterSpacing: "0.02em",
                lineHeight: 0.9,
                color: "#ffd700",
                textShadow: "0 0 30px #ff00aa, 4px 4px 0 #ff2266, 8px 8px 30px rgba(0,0,0,0.8)",
                margin: 0,
              }}
            >
              BAGGY AMAR
            </h1>
            <div
              style={{
                fontSize: "clamp(1.2rem, 4.5vw, 2.6rem)",
                fontWeight: 900,
                color: "#00ffff",
                textShadow: "0 0 20px #00ffff, 3px 3px 0 #ff00aa",
                letterSpacing: "0.2em",
                marginTop: "0.2em",
              }}
            >
              3 DA
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={startGame}
                className="btn-press pulse-glow"
                style={{
                  padding: "14px 44px",
                  fontSize: "clamp(1.1rem, 3vw, 1.7rem)",
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
                <div className="mt-1 text-white/90 font-bold tracking-widest" style={{ fontSize: "0.95rem" }}>
                  HI-SCORE:{" "}
                  <span style={{ color: "#ffd700", textShadow: "0 0 10px #ffd700" }}>{highScore}</span>
                </div>
              )}

              <div className="mt-4 text-white/70 text-[10px] sm:text-xs tracking-widest text-center" style={{ letterSpacing: "0.25em" }}>
                <div>SPACE / TAP — JUMP · DOUBLE FOR CLIMB</div>
                <div className="mt-1">HOLD — JUMP HIGHER · ↓ — SLIDE / DIVE</div>
                <div className="mt-1 text-white/50">COLLECT JEANS · GRAB POWER-UPS · BUILD COMBO</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PLAYING HUD */}
      {gameState === "playing" && (
        <>
          <div
            className="absolute top-3 left-3 sm:top-4 sm:left-4 pointer-events-none"
            style={{
              padding: "8px 14px",
              background: "rgba(26, 11, 61, 0.85)",
              border: "2px solid #ffd700",
              borderRadius: "12px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 20px rgba(255, 215, 0, 0.4)",
            }}
          >
            <div style={{ color: "#ffd700", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.2em" }}>
              SCORE
            </div>
            <div style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 900, lineHeight: 1, textShadow: "0 0 10px #ffd700" }}>
              {score}
            </div>
          </div>

          <div
            className="absolute top-3 right-3 sm:top-4 sm:right-4 pointer-events-none"
            style={{
              padding: "8px 14px",
              background: "rgba(26, 11, 61, 0.85)",
              border: "2px solid #00ffff",
              borderRadius: "12px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 20px rgba(0, 255, 255, 0.4)",
            }}
          >
            <div style={{ color: "#00ffff", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.2em" }}>
              JEANS
            </div>
            <div style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 900, lineHeight: 1, textShadow: "0 0 10px #00ffff" }}>
              👖 {collected}
            </div>
          </div>

          {combo > 1 && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none"
              style={{
                padding: "6px 18px",
                background: "rgba(26, 11, 61, 0.85)",
                border: "2px solid #ff00aa",
                borderRadius: "999px",
                color: "#fff",
                fontWeight: 900,
                letterSpacing: "0.15em",
                fontSize: "1rem",
                textShadow: "0 0 10px #ff00aa",
                animation: "pulse-glow 0.6s ease-in-out infinite",
              }}
            >
              {combo}× COMBO
            </div>
          )}

          {activePower && (
            <div
              className="absolute top-16 sm:top-20 right-3 sm:right-4 pointer-events-none"
              style={{
                padding: "6px 14px",
                background: "rgba(26, 11, 61, 0.85)",
                border: `2px solid ${powerColor}`,
                borderRadius: "10px",
                color: "#fff",
                minWidth: "120px",
              }}
            >
              <div style={{ color: powerColor, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.2em" }}>
                {powerLabel}
              </div>
              <div style={{
                marginTop: "4px",
                height: "5px",
                background: "rgba(255,255,255,0.15)",
                borderRadius: "999px",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${Math.max(0, powerTime / (activePower === "boost" ? 360 : 480) * 100)}%`,
                  background: powerColor,
                  boxShadow: `0 0 10px ${powerColor}`,
                  transition: "width 0.1s linear",
                }} />
              </div>
            </div>
          )}

          <div
            className="absolute inset-0"
            onPointerDown={(e) => {
              e.preventDefault();
              tryJump();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              releaseJump();
            }}
            onPointerCancel={(e) => {
              e.preventDefault();
              releaseJump();
            }}
            style={{ touchAction: "none" }}
          />

          {/* GET READY / RUN! overlay during grace period */}
          {readyOverlay && (
            <div
              key={readyOverlay}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div
                className="title-zoom"
                style={{
                  fontSize: "clamp(3rem, 12vw, 8rem)",
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  color: readyOverlay === "RUN!" ? "#ffd700" : "#fff",
                  textShadow:
                    readyOverlay === "RUN!"
                      ? "0 0 30px #ffd700, 0 0 60px #ff00aa, 6px 6px 0 #ff2266"
                      : "0 0 25px #00ffff, 4px 4px 0 #ff00aa",
                }}
              >
                {readyOverlay}
              </div>
            </div>
          )}
        </>
      )}

      {/* GAME OVER */}
      {gameState === "gameover" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-4"
          style={{
            background: "rgba(10, 5, 24, 0.85)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="text-center w-full max-w-sm">
            <h2
              className="title-zoom"
              style={{
                fontSize: "clamp(2.2rem, 8vw, 5rem)",
                fontWeight: 900,
                color: "#ff2266",
                textShadow: "0 0 30px #ff2266, 4px 4px 0 #1a0b3d",
                letterSpacing: "0.05em",
                margin: 0,
              }}
            >
              GAME OVER
            </h2>

            <div className="mt-6 flex flex-col items-center gap-3">
              <div
                style={{
                  padding: "18px 28px",
                  background: "rgba(26, 11, 61, 0.9)",
                  border: "3px solid #ffd700",
                  borderRadius: "16px",
                  width: "100%",
                  boxShadow: "0 0 30px rgba(255, 215, 0, 0.4)",
                }}
              >
                <div className="flex justify-between items-center mb-2">
                  <span style={{ color: "#ffd700", fontWeight: 700, letterSpacing: "0.1em" }}>SCORE</span>
                  <span style={{ color: "#fff", fontSize: "1.8rem", fontWeight: 900, textShadow: "0 0 10px #ffd700" }}>
                    {score}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span style={{ color: "#00ffff", fontWeight: 700, letterSpacing: "0.1em" }}>JEANS</span>
                  <span style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 900 }}>👖 {collected}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: "#ff00aa", fontWeight: 700, letterSpacing: "0.1em" }}>HI-SCORE</span>
                  <span style={{ color: "#ffd700", fontSize: "1.2rem", fontWeight: 900, textShadow: "0 0 10px #ffd700" }}>
                    {highScore}
                  </span>
                </div>
                {score >= highScore && score > 0 && (
                  <div
                    className="mt-3 neon-flicker"
                    style={{
                      color: "#ffd700",
                      fontWeight: 900,
                      letterSpacing: "0.2em",
                      textShadow: "0 0 20px #ffd700",
                      fontSize: "0.9rem",
                    }}
                  >
                    ★ NEW RECORD ★
                  </div>
                )}
              </div>

              <button
                onClick={startGame}
                className="btn-press pulse-glow mt-2"
                style={{
                  padding: "12px 36px",
                  fontSize: "clamp(1rem, 2.5vw, 1.4rem)",
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
                className="btn-press"
                style={{
                  padding: "8px 24px",
                  fontSize: "0.85rem",
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

          {/* Developer footer — small but unmissable */}
          <div
            className="pointer-events-none"
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: "max(14px, env(safe-area-inset-bottom, 14px))",
              display: "flex",
              justifyContent: "center",
              zIndex: 50,
            }}
          >
            <div
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                background: "rgba(10, 5, 24, 0.75)",
                border: "1px solid rgba(255, 215, 0, 0.4)",
                boxShadow: "0 0 18px rgba(255, 0, 170, 0.35)",
                backdropFilter: "blur(6px)",
                fontSize: "11px",
                letterSpacing: "0.35em",
                fontWeight: 800,
                color: "rgba(255, 255, 255, 0.9)",
                whiteSpace: "nowrap",
                textShadow: "0 0 6px rgba(255, 0, 170, 0.5)",
              }}
            >
              MADE WITH{" "}
              <span
                style={{
                  color: "#ff2266",
                  textShadow: "0 0 10px #ff2266, 0 0 18px #ff2266",
                  fontSize: "13px",
                  display: "inline-block",
                  animation: "pulse-glow 1.4s ease-in-out infinite",
                }}
              >
                ♥
              </span>{" "}
              BY{" "}
              <span
                style={{
                  color: "#ffd700",
                  textShadow: "0 0 10px #ffd700, 0 0 20px #ff00aa",
                  letterSpacing: "0.5em",
                  marginLeft: "2px",
                }}
              >
                NZ R
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
