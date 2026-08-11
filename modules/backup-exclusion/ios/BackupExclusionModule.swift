import ExpoModulesCore

/**
 Marca una carpeta como **«no copiar a iCloud»**.

 Existe por dónde tienen que vivir las canciones descargadas. iOS ofrece dos
 lugares y ninguno de los dos sirve solo:

 - `Caches` está excluido de la copia de seguridad, pero el sistema lo puede
   **borrar cuando el teléfono se queda sin espacio**. Guardar ahí lo que alguien
   bajó a propósito para escuchar sin internet es prometer algo que el sistema
   puede deshacer sin avisar — y justo cuando no hay conexión para rehacerlo.
 - `Documents` no se borra nunca, pero **se copia entero a iCloud**. Un par de
   discos bajados son cientos de megas dentro de los 5 GB gratis que tiene
   cualquiera. Apple lo dice explícitamente en las *iOS Data Storage Guidelines*:
   lo que se puede volver a descargar no va a la copia de seguridad.

 La combinación correcta —`Documents` **más** el atributo
 `isExcludedFromBackup`— no se puede pedir desde JavaScript: expo-file-system no
 expone `setResourceValues`. Son estas quince líneas de Swift y el problema
 desaparece.

 Se aplica **a la carpeta**, una sola vez al arrancar. En iOS el atributo se
 hereda: los archivos que se creen dentro después quedan excluidos igual, así
 que no hay que volver a llamarlo por cada canción.
 */
public class BackupExclusionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BackupExclusion")

    /**
     Devuelve si quedó marcada.

     No lanza: quien llama no puede hacer nada útil con el error —la descarga
     tiene que seguir igual— y lo único que cambia es que esos archivos se
     copiarían a iCloud. Es un problema de higiene, no de funcionamiento.
     */
    Function("excluir") { (uri: String) -> Bool in
      guard var url = URL(string: uri), url.isFileURL else { return false }
      do {
        var valores = URLResourceValues()
        valores.isExcludedFromBackup = true
        try url.setResourceValues(valores)
        return true
      } catch {
        return false
      }
    }
  }
}
