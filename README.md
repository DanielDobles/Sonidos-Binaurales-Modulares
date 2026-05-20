# 🧠 Neuro-Sync Engine (v1.1.0)
### High-Performance Modular Psychoacoustic Synthesis

A sophisticated Web Audio API platform designed for deep brainwave entrainment through hybrid synthesis. Combining precision digital oscillators with organic sample triggering, the Neuro-Sync Engine provides a clinical-grade auditory experience wrapped in a high-fidelity, iridescent interface.

---

## 🚀 Key Architectural Pillars

### 1. Hybrid Isochronic Scheduler (The "Two Clocks" System)
Unlike traditional LFO-based systems, our engine uses a lookahead scheduler for micro-second precision.
- **Phase-Locked Triggers:** Ensures organic samples and synthetic oscillators are perfectly synchronized.
- **Trapezoidal Envelopes:** Custom 50ms attack and 150ms release curves eliminate digital clicks while maintaining rhythmic drive.
- **Dynamic Gain Balancing:** Automatically attenuates Delta frequencies (-35%) and boosts Gamma (+40%) to ensure perceived loudness is consistent across the spectrum.

### 2. Solfeggio Resonance Carriers
Utilizing pure sine wave generation mapped to historical Solfeggio frequencies:
- **396 Hz (Ut):** Liberating Guilt and Fear.
- **528 Hz (Mi):** Transformation and Miracles (DNA Repair).
- **852 Hz (La):** Returning to Spiritual Order.
- *Fletcher-Munson Compensated:* All carriers pass through an equal-loudness contour filter to prevent auditory fatigue.

### 3. Aurora Spectral Visualizer
A real-time 3D experience powered by **Three.js** and **GLSL Shaders**.
- **Time-Domain Displacement:** The waveform is physically displaced by the audio data in real-time.
- **Procedural Aurora:** Shader-based iridescence that reacts to the carrier frequency's hue.
- **Grainient Filter:** Custom SVG turbulence noise for a cinematic, textured aesthetic.

---

## 🛠 Technical Stack

- **Framework:** Next.js 15 (React 19)
- **Audio DSP:** Native Web Audio API (Linear Audio Context)
- **Visuals:** Three.js / React Three Fiber
- **Animations:** Framer Motion 12
- **Styling:** Tailwind CSS 4 + Glassmorphism / Grainient Effects

---

## ⚙️ Installation & Development

```bash
# Clone the repository
git clone https://github.com/DanielDobles/Sonidos-Binaurales-Modulares.git

# Install dependencies
npm install

# Run the development engine
npm run dev
```

---

## 📜 Version History (v1.1.0 Highlights)
- **v1.1.0:** Implementation of the High-Precision Hybrid Engine. Added organic envelopes and frequency-dependent gain balancing. Renamed core nomenclature to "Binaural".
- **v1.0.0:** Initial operational baseline. Solfeggio carriers and Aurora visualizer.

---

## 👨‍💻 Author
**Daniel Dobles**  
*DSP Sound Engineering & Modern UI Design*

---

*“Silence is the canvas, frequency is the brush.”*
