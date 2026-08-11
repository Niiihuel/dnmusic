import ExpoModulesCore
import MediaPlayer

/**
 Los botones de **anterior** y **siguiente** de la pantalla bloqueada.

 expo-audio publica la ficha de lo que suena y registra play, pausa, mover la
 posición y saltar ±10 segundos, pero **no** `nextTrackCommand` ni
 `previousTrackCommand` (ver `MediaController.swift` en el paquete). Desde
 JavaScript no hay forma de agregarlos: son comandos del sistema y hay que
 tomarlos del lado nativo.

 Este módulo hace solo eso. No toca el audio ni la ficha: registra los dos
 comandos que faltan y avisa a la app, que decide qué canción sigue — la cola
 vive en `state/playback` y tiene que seguir siendo la única que manda.

 Los targets se agregan una sola vez y se sueltan al parar. `MPRemoteCommandCenter`
 es un objeto compartido de todo el proceso: dejar targets colgados haría que una
 sesión vieja siguiera respondiendo a los botones.
 */
public class RemoteCommandsModule: Module {
  private var nextTarget: Any?
  private var previousTarget: Any?

  public func definition() -> ModuleDefinition {
    Name("RemoteCommands")

    Events("onNext", "onPrevious")

    Function("start") { [weak self] in
      // El centro de comandos es de UIKit: se toca desde el hilo principal.
      DispatchQueue.main.async {
        guard let self else { return }
        let center = MPRemoteCommandCenter.shared()

        if self.nextTarget == nil {
          self.nextTarget = center.nextTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("onNext", [:])
            return .success
          }
        }
        if self.previousTarget == nil {
          self.previousTarget = center.previousTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("onPrevious", [:])
            return .success
          }
        }

        center.nextTrackCommand.isEnabled = true
        center.previousTrackCommand.isEnabled = true
      }
    }

    Function("stop") { [weak self] in
      DispatchQueue.main.async {
        guard let self else { return }
        let center = MPRemoteCommandCenter.shared()

        if let target = self.nextTarget {
          center.nextTrackCommand.removeTarget(target)
          self.nextTarget = nil
        }
        if let target = self.previousTarget {
          center.previousTrackCommand.removeTarget(target)
          self.previousTarget = nil
        }

        center.nextTrackCommand.isEnabled = false
        center.previousTrackCommand.isEnabled = false
      }
    }

    OnDestroy {
      let center = MPRemoteCommandCenter.shared()
      center.nextTrackCommand.isEnabled = false
      center.previousTrackCommand.isEnabled = false
    }
  }
}
