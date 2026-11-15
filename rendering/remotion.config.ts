import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// WebGL (Three.js) in headless Chrome: ANGLE works without a GPU.
Config.setChromiumOpenGlRenderer('angle');
