import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Calidad de salida para piezas comerciales (1080p nítido).
Config.setCodec("h264");
Config.setCrf(18);
