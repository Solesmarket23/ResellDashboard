'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  angle: number;
  opacity: number;
  color: string;
  lifetime: number;
  maxLifetime: number;
  respawnDelay: number;
  sineOffset: number;
  pathVariation: number;
  pathVariationTimer: number;
  breathingPhase: number;
}

const PARTICLE_COUNT = 18;
const PARTICLE_SIZE = 2; // Increased from 1.5 for better visibility
const MIN_OPACITY = 0.08; // Increased from 0.04
const MAX_OPACITY = 0.20; // Increased from 0.12
const MIN_SPEED = 0.3;
const MAX_SPEED = 0.8;
const ANGLE_VARIANCE = 15;
const SINE_AMPLITUDE = 10;
const SINE_PERIOD = 20; // seconds
const PATH_VARIATION = 2;
const PATH_VARIATION_INTERVAL = [3, 5]; // seconds
const MIN_LIFETIME = 60; // seconds
const MAX_LIFETIME = 90; // seconds
const FADE_DURATION = 3; // seconds
const MIN_RESPAWN_DELAY = 2; // seconds
const MAX_RESPAWN_DELAY = 4; // seconds
const BREATHING_PERIOD = 12; // seconds

// Neon theme colors
const NEON_COLORS = [
  '#00ffff', // cyan
  '#14b8a6', // teal
  '#10b981', // emerald
  '#06b6d4', // cyan-500
  '#0891b2', // cyan-600
  '#0e7490', // cyan-700
];

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    console.log('ParticleBackground component mounted');
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('Canvas ref not found');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2D context');
      return;
    }

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles
    const initParticles = () => {
      particlesRef.current = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particlesRef.current.push(createParticle(i, true)); // Pass true for initial spawn
      }
    };

    const createParticle = (id: number, initialSpawn = false): Particle => {
      const lifetime = MIN_LIFETIME + Math.random() * (MAX_LIFETIME - MIN_LIFETIME);
      const startY = initialSpawn 
        ? Math.random() * window.innerHeight // Random position for initial particles
        : window.innerHeight + 50; // Start below viewport for respawns
      
      return {
        id,
        x: Math.random() * window.innerWidth,
        y: startY,
        size: PARTICLE_SIZE,
        speed: MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED),
        angle: 90 + (Math.random() - 0.5) * ANGLE_VARIANCE * 2, // 90° is upward
        opacity: 0,
        color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
        lifetime: 0,
        maxLifetime: lifetime,
        respawnDelay: MIN_RESPAWN_DELAY + Math.random() * (MAX_RESPAWN_DELAY - MIN_RESPAWN_DELAY),
        sineOffset: Math.random() * Math.PI * 2,
        pathVariation: (Math.random() - 0.5) * PATH_VARIATION * 2,
        pathVariationTimer: PATH_VARIATION_INTERVAL[0] + Math.random() * (PATH_VARIATION_INTERVAL[1] - PATH_VARIATION_INTERVAL[0]),
        breathingPhase: Math.random() * Math.PI * 2,
      };
    };

    const updateParticle = (particle: Particle, deltaTime: number) => {
      particle.lifetime += deltaTime;

      // Handle respawn
      if (particle.lifetime > particle.maxLifetime + particle.respawnDelay) {
        const newParticle = createParticle(particle.id);
        Object.assign(particle, newParticle);
        return;
      }

      // Skip update if in respawn delay
      if (particle.lifetime > particle.maxLifetime) {
        return;
      }

      // Update position
      const angleRad = (particle.angle * Math.PI) / 180;
      particle.y -= particle.speed * deltaTime * 60; // 60 fps base

      // Apply sine wave horizontal movement
      const sineTime = (particle.lifetime + particle.sineOffset) * ((Math.PI * 2) / SINE_PERIOD);
      particle.x += Math.sin(sineTime) * SINE_AMPLITUDE * (deltaTime / SINE_PERIOD);

      // Apply path variation
      particle.pathVariationTimer -= deltaTime;
      if (particle.pathVariationTimer <= 0) {
        particle.pathVariation = (Math.random() - 0.5) * PATH_VARIATION * 2;
        particle.pathVariationTimer = PATH_VARIATION_INTERVAL[0] + Math.random() * (PATH_VARIATION_INTERVAL[1] - PATH_VARIATION_INTERVAL[0]);
      }
      particle.x += particle.pathVariation * deltaTime * 60;

      // Calculate opacity with fade in/out and breathing effect
      let targetOpacity = MIN_OPACITY + Math.random() * (MAX_OPACITY - MIN_OPACITY);
      
      // Breathing effect
      const breathingTime = (particle.lifetime + particle.breathingPhase) * ((Math.PI * 2) / BREATHING_PERIOD);
      const breathingMultiplier = 0.7 + 0.3 * Math.sin(breathingTime);
      targetOpacity *= breathingMultiplier;

      // Fade in
      if (particle.lifetime < FADE_DURATION) {
        const fadeInProgress = particle.lifetime / FADE_DURATION;
        const easedProgress = cubicBezier(fadeInProgress, 0.25, 0.46, 0.45, 0.94);
        particle.opacity = targetOpacity * easedProgress;
      }
      // Fade out
      else if (particle.lifetime > particle.maxLifetime - FADE_DURATION) {
        const fadeOutProgress = (particle.maxLifetime - particle.lifetime) / FADE_DURATION;
        const easedProgress = cubicBezier(fadeOutProgress, 0.25, 0.46, 0.45, 0.94);
        particle.opacity = targetOpacity * easedProgress;
      }
      // Normal
      else {
        particle.opacity = targetOpacity;
      }

      // Wrap horizontal position
      if (particle.x < -20) particle.x = window.innerWidth + 20;
      if (particle.x > window.innerWidth + 20) particle.x = -20;
    };

    const drawParticle = (particle: Particle) => {
      if (particle.opacity <= 0) return;

      ctx.save();
      
      // Apply blur filter and add glow effect
      ctx.filter = 'blur(0.5px)';
      ctx.shadowBlur = 10;
      ctx.shadowColor = particle.color;
      
      // Set color with opacity
      ctx.globalAlpha = particle.opacity;
      ctx.fillStyle = particle.color;
      
      // Draw circle with glow
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw a second pass for extra glow
      ctx.globalAlpha = particle.opacity * 0.5;
      ctx.shadowBlur = 20;
      ctx.fill();
      
      ctx.restore();
    };

    const animate = (currentTime: number) => {
      const deltaTime = lastTimeRef.current ? (currentTime - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = currentTime;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update and draw particles
      particlesRef.current.forEach(particle => {
        updateParticle(particle, deltaTime);
        drawParticle(particle);
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Cubic bezier easing function
    const cubicBezier = (t: number, p1: number, p2: number, p3: number, p4: number): number => {
      const cx = 3 * p1;
      const bx = 3 * (p3 - p1) - cx;
      const ax = 1 - cx - bx;
      const cy = 3 * p2;
      const by = 3 * (p4 - p2) - cy;
      const ay = 1 - cy - by;

      const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
      return sampleCurveY(t);
    };

    // Start animation
    initParticles();
    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ 
        zIndex: 1,
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      }}
    />
  );
}