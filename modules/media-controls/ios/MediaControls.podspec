require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'MediaControls'
  s.version = package['version']
  s.summary = 'Filas multimedia y navegación UIKit'
  s.description = s.summary
  s.author = 'dnmusic'
  s.homepage = 'https://expo.dev'
  s.platforms = { :ios => '15.1' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.swift'
end
