const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle the prebuilt SQLite dictionary as an asset.
config.resolver.assetExts.push('db');

// expo-sqlite's web backend ships a wa-sqlite wasm binary.
config.resolver.assetExts.push('wasm');

module.exports = config;
