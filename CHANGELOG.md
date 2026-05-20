# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-05-20

### Added
- **Hybrid Isochronic Engine:** High-precision scheduler-based triggering for sample/synthetic fusion.
- **Organic Envelopes:** Implemented 50ms attack and 150ms release for pulses to eliminate clicking and improve brainwave induction.
- **Gain Balancing:** Frequency-dependent gain compensation (Delta attenuation, Gamma boost) for balanced loudness.
- **Diagnostics:** Comprehensive audio graph logging system for real-time DSP monitoring.

### Changed
- **Default Experience:** Hybrid mode and 100% isochronic intensity now active on play by default.
- **Nomenclature:** "Beat Frequency" label officially renamed to "Binaural" for better brand alignment.

### Fixed
- **Filter Sync:** Resolved "silence-at-start" bug by synchronizing Bandpass filter frequency with the carrier on microsecond 0.
- **Scheduler Drift:** Fixed pulse burst issues by recalculating start times post-buffer load.

## [1.0.0] - 2026-05-20

### Added
- **Core Audio Engine:** Implementation of a dichotic binaural beat generator with real-time frequency modulation.
- **Solfeggio Carriers:** Support for 6 major Solfeggio frequencies (396Hz to 852Hz) as base carriers.
- **Brainwave Presets:** Integrated Delta, Theta, Alpha, Beta, and Gamma entrainment bands.
- **Visualizer:** 3D Aurora Waveform using Three.js and custom GLSL shaders for real-time frequency analysis.
- **UI/UX:** High-fidelity interface with a 150% default scale, backdrop blur effects, and optimized Grainient SVG filter.
- **Hardware Volume:** GainNode integration for click-free volume control via hardware abstraction.

### Fixed
- Resolved GPU degradation issues caused by heavy SVG filters.
- Optimized AudioContext lifecycle to prevent memory leaks and suspended state issues.

---
*Initial Operational Baseline*
