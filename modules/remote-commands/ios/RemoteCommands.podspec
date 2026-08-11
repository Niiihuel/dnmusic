require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'RemoteCommands'
  s.version        = package['version']
  s.summary        = 'Botones de anterior y siguiente en la pantalla bloqueada'
  s.description    = 'Registra nextTrackCommand y previousTrackCommand, que expo-audio no expone.'
  s.author         = 'dnmusic'
  s.homepage       = 'https://expo.dev'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
