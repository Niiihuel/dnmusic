require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AudioRoute'
  s.version        = package['version']
  s.summary        = 'Botón de AirPlay para elegir la salida de audio'
  s.description    = 'Expone AVRoutePickerView, que no tiene equivalente en JavaScript.'
  s.author         = 'dnmusic'
  s.homepage       = 'https://expo.dev'
  # Solo iOS: AVRoutePickerView es de AVKit para iPhone, y la app es de iPhone.
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
