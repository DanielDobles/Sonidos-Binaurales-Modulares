# Project Instructions (Neuro-Sync Engine)

## Development Workflow
- **Git Protocol**: Every time a significant task, feature, or fix is completed, you MUST perform a `git commit` and `git push`. 
- **Commit Messages**: Use descriptive messages following the [Conventional Commits](https://www.conventionalcommits.org/) standard (e.g., `feat:`, `fix:`, `refactor:`).
- **Audio Integrity**: Ensure all audio assets are placed in the `/public` directory for static serving. Validate audio decoding with robust error handling in `IsochronicModule.ts`.

## Technical Standards
- **Web Audio API**: Maintain phase synchronization between binaural and isochronic layers.
- **Next.js**: Use the `/public` directory for assets that need to be fetched via URL by the AudioContext.
- **Styling**: Prefer Vanilla CSS and Tailwind classes for UI polish.
