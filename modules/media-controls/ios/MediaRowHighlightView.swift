import ExpoModulesCore
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// A passive highlight for the entire row, including its independent menu/+.
/// It never claims a tap or cancels the scroll view, button or context menu.
final class MediaRowHighlightView: ExpoView {
  private lazy var touch = MediaRowTouchObserver { [weak self] value in
    self?.pressed = value
    self?.updateHighlight()
  }
  private lazy var hover = UIHoverGestureRecognizer(target: self, action: #selector(hoverChanged(_:)))
  private var pressed = false
  private var hovered = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isAccessibilityElement = false
    layer.cornerRadius = 8
    layer.cornerCurve = .continuous
  }

  override func willMove(toSuperview newSuperview: UIView?) {
    touch.view?.removeGestureRecognizer(touch)
    hover.view?.removeGestureRecognizer(hover)
    pressed = false
    hovered = false
    updateHighlight()
    super.willMove(toSuperview: newSuperview)
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    superview?.addGestureRecognizer(touch)
    superview?.addGestureRecognizer(hover)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      pressed = false
      hovered = false
      updateHighlight()
    }
  }

  @objc private func hoverChanged(_ recognizer: UIHoverGestureRecognizer) {
    hovered = recognizer.state == .began || recognizer.state == .changed
    updateHighlight()
  }

  private func updateHighlight() {
    backgroundColor = pressed || hovered ? UIColor.white.withAlphaComponent(0.08) : .clear
  }
}

extension UIView {
  var hasMediaRowHighlight: Bool {
    var ancestor = superview
    while let row = ancestor {
      if row.subviews.contains(where: { $0 is MediaRowHighlightView }) { return true }
      if row is UIScrollView { break }
      ancestor = row.superview
    }
    return false
  }
}

private final class MediaRowTouchObserver: UIGestureRecognizer {
  private let highlight: (Bool) -> Void
  private var origin = CGPoint.zero

  init(highlight: @escaping (Bool) -> Void) {
    self.highlight = highlight
    super.init(target: nil, action: nil)
    cancelsTouchesInView = false
    delaysTouchesBegan = false
    delaysTouchesEnded = false
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
  override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool { false }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    guard touches.count == 1, let touch = touches.first else { state = .failed; return }
    origin = touch.location(in: view)
    highlight(true)
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
    guard let touch = touches.first else { return }
    let point = touch.location(in: view)
    if hypot(point.x - origin.x, point.y - origin.y) > 8 || view?.bounds.contains(point) != true {
      highlight(false)
      state = .failed
    }
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) { highlight(false); state = .failed }
  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) { highlight(false); state = .failed }
  override func reset() { super.reset(); highlight(false) }
}
