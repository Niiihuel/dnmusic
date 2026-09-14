package expo.modules.dnandroid

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.ui.ModifierRegistry

/** App semantics stay in Compose, so TalkBack reads the actual editable control. */
class DNAndroidControlsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DNAndroidControls")
    Constant("accessibilityVersion") { 1 }
    OnCreate {
      // The React Native tab shell already reserves the system navigation area.
      ModifierRegistry.register("dnmusicOwnedInsets") { _, _, _, _ ->
        Modifier.consumeWindowInsets(WindowInsets.systemBars)
      }
      ModifierRegistry.register("dnmusicAccessibility") { params, _, _, _ ->
        val label = params["label"] as? String
        val value = params["value"] as? String
        Modifier.semantics {
          if (!label.isNullOrEmpty()) contentDescription = label
          if (!value.isNullOrEmpty()) stateDescription = value
        }
      }
    }
    OnDestroy {
      ModifierRegistry.unregister("dnmusicAccessibility")
      ModifierRegistry.unregister("dnmusicOwnedInsets")
    }
  }
}
