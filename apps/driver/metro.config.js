// Lets the app import the route solver shared with the server
// (supabase/functions/_shared/solver.ts), which lives outside this folder.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../../supabase/functions/_shared')];
module.exports = config;
