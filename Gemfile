source "https://rubygems.org"

gem "fastlane", "~> 2.225"
gem "cocoapods", "~> 1.15"   # opcional, solo si usás CocoaPods en el futuro

plugins_path = File.join(File.dirname(__FILE__), 'fastlane', 'Pluginfile')
eval_gemfile(plugins_path) if File.exist?(plugins_path)
