#include <assert.h>
#include <math.h>
#include <stdio.h>
#include "DNCrossfadeDSP.h"

static void near(float actual, float expected) {
  assert(fabsf(actual - expected) < 0.00001f);
}

int main(void) {
  near(DNCrossfadeGain(1, 0, NULL, 6.0, 10.0, 4.0), 1.0f);
  near(DNCrossfadeGain(3, 0, NULL, 6.0, 10.0, 4.0), 0.0f);
  near(DNCrossfadeGain(1, 0, NULL, 12.0, 10.0, 4.0), 0.5f);
  near(DNCrossfadeGain(3, 0, NULL, 12.0, 10.0, 4.0), 0.5f);
  near(DNCrossfadeGain(1, 0, NULL, 14.0, 10.0, 4.0), 0.0f);
  near(DNCrossfadeGain(3, 0, NULL, 14.0, 10.0, 4.0), 1.0f);
  near(DNCrossfadeGain(2, 0, NULL, 100.0, 10.0, 4.0), 0.0f);
  near(DNCrossfadeGain(3, 0, NULL, NAN, 10.0, 4.0), 0.0f);
  near(DNCrossfadeGain(1, 0, NULL, NAN, 10.0, 4.0), 1.0f);
  // Half of the caller-owned base volume remains half at the midpoint.
  near(0.4f * DNCrossfadeGain(3, 0, NULL, 12.0, 10.0, 4.0), 0.2f);
  near(DNCrossfadeGain(1, 1, NULL, 12.0, 10.0, 4.0), 0.70710678f);
  near(DNCrossfadeGain(3, 1, NULL, 12.0, 10.0, 4.0), 0.70710678f);

  DNCrossfadeCurve shape = {.count = 3, .times = {0, 0.25, 1}, .values = {1, 0.25, 0}};
  near(DNCrossfadeGain(1, 0, &shape, 11.0, 10.0, 4.0), 0.25f);
  near(DNCrossfadeGain(1, 0, &shape, 12.5, 10.0, 4.0), 0.125f);
  puts("Crossfade DSP OK");
}
