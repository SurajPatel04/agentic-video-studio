# Agentic Video Studio

Reusable, frame-driven Remotion scenes for study videos.

```sh
cd rendering
npm ci
npm run studio
```

Select **NetworkingDemo** for the complete LAN/MAN/WAN visual lesson, **NetworkingPriority** for the three priority scenes, **StudyGallery** for teaching cards, **InfrastructureDemo** for buildings/devices, or **GlobeDemo** for WAN routes.

```sh
cd rendering
npm run typecheck
npm run check:scenes
npm run check:visual
npx remotion render NetworkingDemo out/networking-complete.mp4
```

Scene controls and examples:

- [Networking and teaching scenes](docs/Networking-scenes.md)
- [Buildings and devices](docs/Infrastructure-scenes.md)
- [Satellite globe and India boundaries](docs/Globe-scenes.md)
- [Machine-readable scene registry](library/registry.json)

The demos provide visuals; narration and audio assembly belong to the backend pipeline.
