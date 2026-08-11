const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// El árbol Swift heredado vive en el mismo repo; que Metro no lo vigile.
config.resolver.blockList = [/\/DanyApp\/.*/, /\/fastlane\/.*/]

module.exports = withNativeWind(config, { input: './global.css' })
