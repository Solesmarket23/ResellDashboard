'use client';

import { useState } from 'react';
import { useTheme } from '../lib/contexts/ThemeContext';

const AudioPreview = () => {
  const { currentTheme } = useTheme();
  const isPremium = currentTheme.name === 'Premium';
  const isLight = currentTheme.name === 'Light';
  const isRevolutionary = currentTheme.name === 'Premium'; // Revolutionary Creative = Premium theme
  
  const [playing, setPlaying] = useState<number | null>(null);

  const playAudio = (audioId: number, audioFunction: () => void) => {
    setPlaying(audioId);
    audioFunction();
    setTimeout(() => setPlaying(null), 2000);
  };

  // Audio Chime Functions - All Single Sounds
  const audioChimes = [
    {
      id: 1,
      name: "Classic Bell",
      description: "Simple bell tone",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(523, audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 2);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 2);
      }
    },
    {
      id: 2,
      name: "High Chime",
      description: "Bright high-pitched chime",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(880, audioContext.currentTime);
        gain.gain.setValueAtTime(0.25, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 1.5);
      }
    },
    {
      id: 3,
      name: "Soft Tone",
      description: "Gentle mellow sound",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(440, audioContext.currentTime);
        gain.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 2);
        osc.type = 'triangle';
        osc.start();
        osc.stop(audioContext.currentTime + 2);
      }
    },
    {
      id: 4,
      name: "Digital Beep",
      description: "Clean digital sound",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(800, audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
        osc.type = 'square';
        osc.start();
        osc.stop(audioContext.currentTime + 0.5);
      }
    },
    {
      id: 5,
      name: "Low Gong",
      description: "Deep resonant tone",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(200, audioContext.currentTime);
        gain.gain.setValueAtTime(0.4, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 2);
        osc.type = 'triangle';
        osc.start();
        osc.stop(audioContext.currentTime + 2);
      }
    },
    {
      id: 6,
      name: "Sharp Ping",
      description: "Quick sharp sound",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(1200, audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 0.3);
      }
    },
    {
      id: 7,
      name: "Warm Bell",
      description: "Cozy warm tone",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(392, audioContext.currentTime);
        gain.gain.setValueAtTime(0.25, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 2);
        osc.type = 'triangle';
        osc.start();
        osc.stop(audioContext.currentTime + 2);
      }
    },
    {
      id: 8,
      name: "Crystal Ting",
      description: "Clear crystal sound",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(1568, audioContext.currentTime);
        gain.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 1);
      }
    },
    {
      id: 9,
      name: "Wood Block",
      description: "Natural percussion sound",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(600, audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
        osc.type = 'sawtooth';
        osc.start();
        osc.stop(audioContext.currentTime + 0.4);
      }
    },
    {
      id: 10,
      name: "Space Beep",
      description: "Futuristic electronic tone",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(750, audioContext.currentTime);
        gain.gain.setValueAtTime(0.25, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
        osc.type = 'square';
        osc.start();
        osc.stop(audioContext.currentTime + 1);
      }
    },
    {
      id: 11,
      name: "Church Bell",
      description: "Traditional bell sound",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(523, audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 2.5);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 2.5);
      }
    },
    {
      id: 12,
      name: "Harp Pluck",
      description: "Single harp string",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(659, audioContext.currentTime);
        gain.gain.setValueAtTime(0.25, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
        osc.type = 'triangle';
        osc.start();
        osc.stop(audioContext.currentTime + 1.5);
      }
    },
    {
      id: 13,
      name: "Game Coin",
      description: "Retro gaming pickup sound",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(988, audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
        osc.type = 'square';
        osc.start();
        osc.stop(audioContext.currentTime + 0.4);
      }
    },
    {
      id: 14,
      name: "Singing Bowl",
      description: "Meditation bowl tone",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(432, audioContext.currentTime);
        gain.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 3);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 3);
      }
    },
    {
      id: 15,
      name: "Piano Note",
      description: "Single piano key",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(523, audioContext.currentTime);
        gain.gain.setValueAtTime(0.25, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 2);
        osc.type = 'triangle';
        osc.start();
        osc.stop(audioContext.currentTime + 2);
      }
    },
    {
      id: 16,
      name: "Glass Ting",
      description: "High pitched glass sound",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(1760, audioContext.currentTime);
        gain.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 0.8);
      }
    },
    {
      id: 17,
      name: "Doorbell Ding",
      description: "Single doorbell tone",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(659, audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 1.5);
      }
    },
    {
      id: 18,
      name: "Bubble Pop",
      description: "Single bubble pop",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(1000, audioContext.currentTime);
        gain.gain.setValueAtTime(0.25, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 0.2);
      }
    },
    {
      id: 19,
      name: "Bass Thump",
      description: "Deep bass tone",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(100, audioContext.currentTime);
        gain.gain.setValueAtTime(0.4, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
        osc.type = 'sawtooth';
        osc.start();
        osc.stop(audioContext.currentTime + 1);
      }
    },
    {
      id: 20,
      name: "Phone Ding",
      description: "Modern notification sound",
      play: () => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(740, audioContext.currentTime);
        gain.gain.setValueAtTime(0.25, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8);
        osc.type = 'sine';
        osc.start();
        osc.stop(audioContext.currentTime + 0.8);
      }
    }
  ];

  return (
    <div className="p-8">
      <div className="text-center mb-8">
        <h1 className={`text-3xl font-bold mb-4 ${
          isRevolutionary ? 'heading-revolutionary' :
          isPremium ? 'text-premium-gradient' : 
          isLight ? 'text-gray-900' : 'text-white'
        }`}>
          🎵 Audio Chime Preview
        </h1>
        <p className={`${
          isRevolutionary ? 'text-white/80' :
          isPremium ? 'text-slate-400' : 
          isLight ? 'text-gray-600' : 'text-gray-400'
        }`}>
          Click any button to preview the success chime. Each sound is a single tone with different characteristics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {audioChimes.map((chime) => (
          <div key={chime.id} className={`
            rounded-xl border p-6 hover:shadow-lg transition-shadow
            ${isRevolutionary
              ? 'revolutionary-card'
              : isPremium 
                ? 'dark-premium-card' 
                : isLight
                  ? 'bg-white border-gray-200'
                  : 'bg-gray-800 border-gray-700'
            }
          `}>
            <div className="text-center">
              <h3 className={`text-lg font-semibold mb-2 ${
                isRevolutionary ? 'text-revolutionary-gradient' :
                isPremium || !isLight ? 'text-white' : 'text-gray-900'
              }`}>
                {chime.name}
              </h3>
              <p className={`text-sm mb-4 ${
                isRevolutionary ? 'text-white/70' :
                isPremium ? 'text-slate-400' : 
                isLight ? 'text-gray-600' : 'text-gray-400'
              }`}>
                {chime.description}
              </p>
              <button
                onClick={() => playAudio(chime.id, chime.play)}
                disabled={playing === chime.id}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                  playing === chime.id
                    ? 'bg-green-500 text-white'
                    : isRevolutionary
                      ? 'btn-revolutionary'
                      : isPremium
                        ? 'btn-premium'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {playing === chime.id ? '🎵 Playing...' : `🎧 Play #${chime.id}`}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={`
        mt-8 p-6 rounded-xl border
        ${isRevolutionary
          ? 'bg-white/5 border-white/20 backdrop-blur-xl'
          : isPremium 
            ? 'bg-slate-800 border-slate-600' 
            : isLight
              ? 'bg-blue-50 border-blue-200'
              : 'bg-gray-800 border-gray-700'
        }
      `}>
        <h3 className={`text-lg font-semibold mb-2 ${
          isRevolutionary ? 'text-revolutionary-gradient' :
          isPremium ? 'text-white' : 
          isLight ? 'text-blue-900' : 'text-white'
        }`}>
          🎯 Instructions
        </h3>
        <p className={`${
          isRevolutionary ? 'text-white/80' :
          isPremium ? 'text-slate-300' : 
          isLight ? 'text-blue-800' : 'text-gray-300'
        }`}>
          Listen to each chime and pick your favorite! Once you decide, just let me know the number 
          (e.g., "I like #5" or "Use number 12") and I'll integrate it into your scan success feedback.
        </p>
      </div>
    </div>
  );
};

export default AudioPreview; 