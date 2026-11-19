import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
// Lecture narration and sound effects share one stereo AAC track.
Config.setAudioBitrate('128k');
Config.setOverwriteOutput(true);
// WebGL (Three.js) in headless Chrome: ANGLE works without a GPU.
Config.setChromiumOpenGlRenderer('angle');
