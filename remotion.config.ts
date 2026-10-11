import { Config } from '@remotion/cli/config';
Config.setPublicDir('./video/public');
Config.setConcurrency(2);
Config.setOverwriteOutput(true);
Config.setVideoImageFormat('jpeg');
