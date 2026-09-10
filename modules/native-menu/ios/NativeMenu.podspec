require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'NativeMenu'
  s.version        = package['version']
  s.summary        = 'Menú del sistema (UIMenu) para el disparador de los tres puntos'
  s.description    = 'Presenta un UIMenu de UIKit al tocar, sin pasar por SwiftUI.'
  s.author         = 'dnmusic'
  s.homepage       = 'https://expo.dev'
  # Sólo iOS: la app es de iPhone y UIMenu es de UIKit.
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.swift'
end
